"""MVP-Workflow 3: PDF-Analyse – lokal extrahieren, Tabelle und Bericht mit Dateiverweisen.

- Standard: komplett lokal (pypdf + extraktive Zusammenfassung), keine Daten verlassen den Rechner.
- Optional KI-Zusammenfassung: nur mit Berechtigung „ai.cloud“ UND Freigabe direkt vor dem Senden.
- Gescannte PDFs (kaum Text) werden erkannt; OCR ist bewusst nicht aktiviert (optional, später).
- Liest nur; Ergebnisse liegen im NEXORA-Datenordner.
"""

from __future__ import annotations

import asyncio
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from ..llm import LlmError, provider_for, summarize
from ..runner import RunContext, Workflow, WorkflowError
from ..safety import redact_text, scan_for_prompt_injection
from ..textutil import extractive_summary, key_terms

MAX_FILE_BYTES = 50 * 1024 * 1024
COLUMNS = ["Nr.", "Datei", "Pfad", "Seiten", "Wörter", "Titel", "Autor", "Kernbegriffe", "Zusammenfassung", "Zusammenfassung durch", "Hinweise"]


class PdfInput(BaseModel):
    files: list[str] = Field(min_length=1, max_length=20)
    useCloudAi: bool = False

    @field_validator("files")
    @classmethod
    def _files(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for raw in v:
            p = Path(raw)
            if not p.is_absolute():
                raise ValueError("Pfade müssen absolut sein")
            if p.suffix.lower() != ".pdf":
                raise ValueError(f"Keine PDF-Datei: {p.name}")
            if not p.is_file():
                raise ValueError(f"Datei nicht gefunden: {p.name}")
            if p.stat().st_size > MAX_FILE_BYTES:
                raise ValueError(f"Datei zu groß (>50 MB): {p.name}")
            r = str(p.resolve())
            if r not in out:
                out.append(r)
        return out


@dataclass
class PdfInfo:
    path: Path
    pages: int
    words: int
    title: str
    author: str
    text: str
    notes: list[str]


def read_pdf(path: Path) -> PdfInfo:
    try:
        reader = PdfReader(str(path))
    except (PdfReadError, OSError, ValueError) as e:
        raise WorkflowError(f"PDF nicht lesbar: {type(e).__name__}") from e
    notes: list[str] = []
    if reader.is_encrypted:
        try:
            if not reader.decrypt(""):
                raise WorkflowError("passwortgeschützt")
        except Exception as e:  # noqa: BLE001
            raise WorkflowError("passwortgeschützt – bitte ungeschützte Kopie verwenden") from e
    texts = []
    empty = 0
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:  # noqa: BLE001
            t = ""
        if len(t.strip()) < 20:
            empty += 1
        texts.append(t)
    text = "\n".join(texts)
    pages = len(reader.pages)
    if pages and empty == pages:
        notes.append("gescannt/ohne Textebene – OCR nicht aktiviert (optional)")
    elif empty:
        notes.append(f"{empty} Seite(n) ohne Text (evtl. Bilder/Scans)")
    if scan_for_prompt_injection(text):
        notes.append("enthält anweisungsähnlichen Text (als Daten behandelt)")
    meta = reader.metadata or {}
    return PdfInfo(
        path=path, pages=pages, words=len(text.split()),
        title=redact_text(str(getattr(meta, "title", None) or meta.get("/Title", "") or "")).strip()[:200],
        author=redact_text(str(getattr(meta, "author", None) or meta.get("/Author", "") or "")).strip()[:200],
        text=redact_text(text), notes=notes,
    )


def _csv_safe(value: str) -> str:
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


class PdfAnalysis(Workflow):
    name: ClassVar[str] = "pdf_analysis"
    agent_id: ClassVar[str] = "agent-analyst"
    agent_name: ClassVar[str] = "Analyst"
    capabilities: ClassVar[frozenset[str]] = frozenset({"pdf.read", "files.export"})
    Input = PdfInput

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, PdfInput)
        return f"{len(data.files)} PDF-Datei(en) analysieren"

    def required_capabilities(self, data: BaseModel) -> frozenset[str]:
        assert isinstance(data, PdfInput)
        return self.capabilities | ({"ai.cloud"} if data.useCloudAi else frozenset())

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, PdfInput)
        files = [Path(f) for f in data.files]
        steps = [(f"pdf{i}", f"PDF {i}: {p.name}") for i, p in enumerate(files, 1)]
        extra = [("ai", "KI-Zusammenfassung")] if data.useCloudAi else []
        ctx.plan(steps + extra + [("report", "Tabelle und Bericht erstellen"), ("verify", "Ergebnis prüfen")])

        infos: list[tuple[int, PdfInfo | None, str]] = []
        for (sid, title), (i, path) in zip(steps, enumerate(files, 1)):
            ctx.step_started(sid, title)
            try:
                info = await asyncio.to_thread(read_pdf, path)
                infos.append((i, info, ""))
                ctx.step_succeeded(sid, f"{info.pages} Seiten, {info.words} Wörter" + (f" – {info.notes[0]}" if info.notes else ""))
            except WorkflowError as e:
                infos.append((i, None, str(e)))
                ctx.step_failed(sid, str(e))
        readable = [inf for _, inf, _ in infos if inf and inf.words > 0]
        if not any(inf for _, inf, _ in infos):
            raise WorkflowError("Keine der PDF-Dateien konnte gelesen werden")

        summaries: dict[Path, tuple[str, str]] = {}
        for _, inf, _ in infos:
            if inf:
                summaries[inf.path] = (extractive_summary(inf.text), "lokal (extraktiv)")

        if data.useCloudAi:
            ctx.step_started("ai", "KI-Zusammenfassung")
            provider = provider_for(ctx.secrets)
            if provider is None:
                ctx.step_failed("ai", "Kein API-Schlüssel hinterlegt – lokale Zusammenfassung verwendet")
            elif not readable:
                ctx.step_failed("ai", "Kein Text zum Zusammenfassen – lokale Auswertung verwendet")
            else:
                chars = sum(min(len(inf.text), 12_000) for inf in readable)
                decision = await ctx.approve(
                    action="Dokumentinhalte an KI-Anbieter senden",
                    target="Anthropic" if provider == "anthropic" else "OpenAI",
                    data=f"{len(readable)} Datei(en), insgesamt ca. {chars:,} Zeichen Text (gekürzt auf 12.000 je Datei)".replace(",", "."),
                    impact="Die Texte verlassen deinen Rechner und werden vom Anbieter verarbeitet. Es fallen API-Kosten auf deinem Konto an.",
                )
                if decision != "allow":
                    ctx.step_failed("ai", "Senden abgelehnt – lokale Zusammenfassung verwendet")
                else:
                    tokens_in = tokens_out = 0
                    errors = 0
                    for inf in readable:
                        ctx.check_cancel()
                        try:
                            res = await asyncio.to_thread(summarize, inf.text, ctx.secrets)
                            summaries[inf.path] = (redact_text(res.text), f"{res.provider} {res.model}")
                            tokens_in += res.input_tokens
                            tokens_out += res.output_tokens
                        except LlmError as e:
                            errors += 1
                            summaries[inf.path] = (summaries[inf.path][0], f"lokal (KI-Fehler: {e})")
                    msg = f"{len(readable) - errors}/{len(readable)} per KI, {tokens_in} Eingabe-/{tokens_out} Ausgabe-Token"
                    (ctx.step_failed if errors == len(readable) else ctx.step_succeeded)("ai", msg)

        ctx.step_started("report", "Tabelle und Bericht erstellen")
        run_dir = ctx.data_dir / "runs" / ctx.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        csv_path = run_dir / "PDF-Analyse.csv"
        md_path = run_dir / "PDF-Bericht.md"
        md = [f"# PDF-Analyse\n", f"{len(files)} Datei(en) ausgewertet.\n"]
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(COLUMNS)
            for i, inf, err in infos:
                p = files[i - 1]
                if inf:
                    summary, by = summaries[inf.path]
                    terms = ", ".join(key_terms(inf.text))
                    notes = "; ".join(inf.notes)
                    w.writerow([i, p.name, str(p), inf.pages, inf.words, _csv_safe(inf.title), _csv_safe(inf.author), _csv_safe(terms), _csv_safe(summary), by, _csv_safe(notes)])
                    md += [f"## {i}. [{p.name}]({p.as_uri()})\n", f"- Seiten: {inf.pages}, Wörter: {inf.words}", f"- Kernbegriffe: {terms or '–'}"]
                    if notes:
                        md.append(f"- Hinweise: {notes}")
                    md += [f"- Zusammenfassung ({by}):\n\n{summary or '_(kein auswertbarer Text)_'}\n"]
                else:
                    w.writerow([i, p.name, str(p), "", "", "", "", "", "", "", _csv_safe(f"Fehler: {err}")])
                    md += [f"## {i}. {p.name}\n", f"- Fehler: {err}\n"]
        md_path.write_text("\n".join(md), encoding="utf-8")
        ctx.artifact("table", "PDF-Analyse.csv", csv_path)
        ctx.artifact("file", "PDF-Bericht.md", md_path)
        ctx.step_succeeded("report", "CSV und Bericht geschrieben")

        ctx.step_started("verify", "Ergebnis prüfen")
        rows = list(csv.reader(open(csv_path, newline="", encoding="utf-8-sig"), delimiter=";"))
        report = md_path.read_text(encoding="utf-8")
        missing = [p.name for p in files if p.name not in report]
        if rows[0] != COLUMNS or len(rows) - 1 != len(files) or missing:
            ctx.step_failed("verify", "Ergebnis unvollständig")
            ctx.fail("Prüfung fehlgeschlagen: Tabelle oder Bericht enthält nicht alle Dateien")
            return
        ctx.step_succeeded("verify", "alle Dateien referenziert")
        failed = sum(1 for _, inf, _ in infos if inf is None)
        scanned = sum(1 for _, inf, _ in infos if inf and inf.words == 0)
        ctx.succeed(
            f"{len(files) - failed} von {len(files)} PDF(s) ausgewertet"
            + (f", {failed} nicht lesbar" if failed else "")
            + (f", {scanned} ohne Textebene" if scanned else "")
            + f". Tabelle ({len(rows) - 1} Zeilen) und Bericht geprüft: jede Datei ist referenziert."
        )

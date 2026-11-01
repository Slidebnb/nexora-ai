"""„Frag deine Dateien“: durchsucht einen lokalen Ordner (Texte + PDFs) und beantwortet eine Frage dazu mit der KI.

Die Dateien werden rein lokal gelesen. Nur die relevanten Ausschnitte und die Frage gehen – NACH Freigabe – an die
KI (Berechtigung „ai.cloud“). Es wird nichts gesendet, bevor der Nutzer zustimmt.
"""

from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from ..llm import LlmError, complete, provider_for
from ..runner import RunContext, Workflow
from ..safety import redact_text, scan_for_prompt_injection
from ..textutil import key_terms
from .organizer import validate_root

ASK_SYSTEM = (
    "Du beantwortest eine Frage ausschließlich anhand der mitgelieferten Unterlagen des Nutzers. "
    "Antworte knapp und auf Deutsch. Nenne, aus welcher Datei eine Aussage stammt. "
    "Wenn die Unterlagen die Frage nicht beantworten, sage das ehrlich – erfinde nichts."
)

TEXT_SUFFIXES = {".txt", ".md", ".csv", ".log"}
MAX_FILES = 40
MAX_FILE_BYTES = 2_000_000
MAX_CONTEXT_CHARS = 12_000


class AskInput(BaseModel):
    folder: str
    question: str = Field(min_length=3, max_length=500)

    @field_validator("folder")
    @classmethod
    def _folder(cls, v: str) -> str:
        return str(validate_root(v))


def _read_text(path: Path) -> str:
    try:
        if path.suffix.lower() == ".pdf":
            reader = PdfReader(str(path))
            return "\n".join((page.extract_text() or "") for page in reader.pages[:50])
        return path.read_text(encoding="utf-8", errors="replace")
    except (OSError, PdfReadError, ValueError):
        return ""


def _collect(root: Path) -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    for p in sorted(root.rglob("*")):
        if len(out) >= MAX_FILES:
            break
        if not p.is_file() or p.is_symlink() or p.name.startswith("."):
            continue
        if p.suffix.lower() not in TEXT_SUFFIXES and p.suffix.lower() != ".pdf":
            continue
        try:
            if p.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        text = _read_text(p).strip()
        if text:
            out.append((p.relative_to(root), text))
    return out


class AskFiles(Workflow):
    name: ClassVar[str] = "ask_files"
    agent_id: ClassVar[str] = "agent-dokumente"
    agent_name: ClassVar[str] = "Dokumente"
    capabilities: ClassVar[frozenset[str]] = frozenset({"files.read", "ai.cloud"})
    Input = AskInput

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, AskInput)
        return f"Frage an Ordner „{Path(data.folder).name}“: {data.question[:60]}"

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, AskInput)
        root = Path(data.folder)
        ctx.plan([("scan", "Dateien lokal lesen"), ("select", "Relevante Stellen auswählen"), ("ask", "Frage mit KI beantworten"), ("verify", "Ergebnis prüfen")])

        ctx.step_started("scan", "Dateien lokal lesen")
        docs = _collect(root)
        if not docs:
            ctx.step_succeeded("scan", "keine lesbaren Dateien")
            ctx.succeed(f"Im Ordner {root} wurden keine lesbaren Text- oder PDF-Dateien gefunden. Es wurde nichts gesendet.", "Keine lesbaren Dateien gefunden.")
            return
        ctx.step_succeeded("scan", f"{len(docs)} Datei(en) gelesen")

        ctx.step_started("select", "Relevante Stellen auswählen")
        terms = [t.lower() for t in key_terms(data.question)]
        scored = [(sum(text.lower().count(t) for t in terms) if terms else 1, name, text) for name, text in docs]
        relevant = [(n, t) for s, n, t in sorted(scored, key=lambda x: -x[0]) if s > 0] or [(n, t) for _, n, t in scored]
        context = ""
        used: list[str] = []
        for name, text in relevant:
            block = f"### Datei: {name}\n{text}\n\n"
            if len(context) + len(block) > MAX_CONTEXT_CHARS:
                block = block[: max(0, MAX_CONTEXT_CHARS - len(context))]
            context += block
            used.append(str(name))
            if len(context) >= MAX_CONTEXT_CHARS:
                break
        if scan_for_prompt_injection(context):
            ctx.step_succeeded("select", f"{len(used)} Datei(en) – Hinweis: verdächtige Anweisungen im Text ignoriert")
        else:
            ctx.step_succeeded("select", f"{len(used)} Datei(en) ausgewählt")

        ctx.step_started("ask", "Frage mit KI beantworten")
        if provider_for(ctx.secrets) is None:
            ctx.step_failed("ask", "Kein KI-Schlüssel hinterlegt")
            ctx.fail("Für „Frag deine Dateien“ wird ein KI-Schlüssel benötigt (Anthropic oder OpenAI). Bitte in den Einstellungen hinterlegen.")
            return
        decision = await ctx.approve(
            action="Frage mit KI beantworten",
            target=str(root),
            data=f"Frage: {data.question}\nEs werden relevante Ausschnitte aus {len(used)} Datei(en) an die KI gesendet.",
            impact="Ausgewählte Textausschnitte und deine Frage werden an deinen KI-Anbieter übertragen. Nichts wird verändert oder gelöscht.",
        )
        if decision != "allow":
            ctx.step_failed("ask", "Abgelehnt – nichts gesendet")
            ctx.fail("Du hast das Senden an die KI abgelehnt. Es wurde nichts gesendet.")
            return
        try:
            res = complete(ASK_SYSTEM, f"<frage>\n{data.question}\n</frage>\n<unterlagen>\n{context}\n</unterlagen>", ctx.secrets)
        except LlmError as e:
            ctx.step_failed("ask", str(e))
            ctx.fail(f"Die KI-Anfrage ist fehlgeschlagen: {e}")
            return
        answer = redact_text(res.text)
        ctx.step_succeeded("ask", f"Antwort erstellt ({res.provider} {res.model})")

        run_dir = ctx.data_dir / "runs" / ctx.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        report = run_dir / "Antwort.md"
        report.write_text(f"# Frage\n{data.question}\n\n# Antwort\n{answer}\n\n# Genutzte Dateien\n" + "\n".join(f"- {u}" for u in used) + "\n", encoding="utf-8")
        ctx.artifact("report", "Antwort.md", report)
        ctx.succeed(f"Frage anhand von {len(used)} Datei(en) beantwortet:\n\n{answer}", f"Antwort aus {len(used)} Datei(en).")

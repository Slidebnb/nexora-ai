"""MVP-Workflow 2: Web-Recherche – öffentliche Seiten lesen, Vergleichstabelle mit Quellen und Zeitstempel, CSV.

Nur lesend. Die CSV wird im NEXORA-Datenordner abgelegt (keine Nutzerdateien verändert → keine Freigabe nötig).
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import ClassVar, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from ..engines import BrowserUseEngine, DirectEngine, EngineError, SourceResult, WebEngine, browser_use_available
from ..runner import RunContext, Workflow, WorkflowError

COLUMNS = ["Nr.", "Quelle (URL)", "Aufgerufene URL", "Abgerufen (UTC)", "Status", "Titel", "Antwort / Textstelle", "Treffer", "Hinweise", "Engine"]


class ResearchInput(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    urls: list[str] = Field(min_length=1, max_length=10)
    engine: Literal["auto", "direct", "browser_use"] = "auto"

    @field_validator("urls")
    @classmethod
    def _urls(cls, v: list[str]) -> list[str]:
        out = []
        for u in v:
            p = urlparse(u.strip())
            if p.scheme not in ("http", "https") or not p.hostname:
                raise ValueError(f"Ungültige Adresse: {u}")
            if u.strip() not in out:
                out.append(u.strip())
        return out


def _csv_safe(value: str) -> str:
    """Verhindert Formel-Injection beim Öffnen in Excel."""
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


class WebResearch(Workflow):
    name: ClassVar[str] = "web_research"
    agent_id: ClassVar[str] = "agent-rechercheur"
    agent_name: ClassVar[str] = "Rechercheur"
    capabilities: ClassVar[frozenset[str]] = frozenset({"web.read", "files.export"})
    Input = ResearchInput

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, ResearchInput)
        return f"Recherche: {data.question[:60]}" + ("…" if len(data.question) > 60 else "")

    def _engine(self, ctx: RunContext, data: ResearchInput) -> WebEngine:
        want_ai = data.engine == "browser_use" or (data.engine == "auto" and browser_use_available() and bool(ctx.secrets))
        if not want_ai:
            return DirectEngine()
        if not browser_use_available():
            raise WorkflowError("browser-use ist nicht installiert (im Ordner worker: `uv sync --extra browser`)")
        try:
            return BrowserUseEngine(ctx.secrets, ctx.data_dir / "browser-profile")
        except EngineError as e:
            raise WorkflowError(str(e)) from e

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, ResearchInput)
        engine = self._engine(ctx, data)
        steps = [(f"src{i}", f"Quelle {i}: {urlparse(u).hostname}") for i, u in enumerate(data.urls, 1)]
        ctx.plan(steps + [("table", "Vergleichstabelle erstellen"), ("verify", "Export prüfen")])
        results: list[tuple[int, SourceResult | None, str]] = []
        cost = 0.0
        try:
            for (sid, title), (i, url) in zip(steps, enumerate(data.urls, 1)):
                await ctx.checkpoint()
                ctx.step_started(sid, title)
                try:
                    r = await engine.research(url, data.question)
                    results.append((i, r, ""))
                    ctx.step_succeeded(sid, r.title[:80] or r.status)
                    if r.cost_usd:
                        cost += r.cost_usd
                        ctx.cost(cost)
                except EngineError as e:
                    results.append((i, None, str(e)))
                    ctx.step_failed(sid, str(e))
        finally:
            await engine.close()

        ok = [r for _, r, _ in results if r]
        if not ok:
            raise WorkflowError("Keine der Quellen konnte gelesen werden")

        ctx.step_started("table", "Vergleichstabelle erstellen")
        run_dir = ctx.data_dir / "runs" / ctx.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        out = run_dir / "Recherche.csv"
        with open(out, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(COLUMNS)
            for i, r, err in results:
                url = data.urls[i - 1]
                if r:
                    w.writerow([i, url, r.final_url, r.fetched_at, r.status, _csv_safe(r.title), _csv_safe(r.answer), r.hits, _csv_safe(r.notes), engine.label])
                else:
                    w.writerow([i, url, "", "", "Fehler", "", "", 0, _csv_safe(err), engine.label])
        ctx.artifact("export", "Recherche.csv", out)
        ctx.step_succeeded("table", f"{len(results)} Zeilen")

        ctx.step_started("verify", "Export prüfen")
        with open(out, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.reader(f, delimiter=";"))
        if rows[0] != COLUMNS or len(rows) - 1 != len(data.urls):
            ctx.step_failed("verify", "CSV unvollständig")
            ctx.fail("Export-Prüfung fehlgeschlagen: CSV hat nicht die erwartete Anzahl Zeilen")
            return
        ctx.step_succeeded("verify", "CSV vollständig")
        failed = len(data.urls) - len(ok)
        ctx.succeed(
            f"{len(ok)} von {len(data.urls)} Quellen gelesen ({engine.label})"
            + (f", {failed} fehlgeschlagen" if failed else "")
            + f". CSV mit {len(rows) - 1} Zeilen geschrieben und erneut eingelesen.",
            f"{len(ok)} von {len(data.urls)} Webseiten ausgewertet – deine Tabelle ist fertig.",
        )

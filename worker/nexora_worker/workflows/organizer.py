"""MVP-Workflow 1: Ordner-Organisator (echte Dateioperationen, nur nach Freigabe, mit Undo).

Regeln:
- Nur Dateien direkt im gewählten Ordner (keine Unterordner, keine versteckten Dateien, keine Links).
- Es wird nichts gelöscht und nichts überschrieben. Namenskonflikte bekommen „ (1)“, „ (2)“ …
- Vor dem Verschieben: Freigabe mit konkreter Liste. Während des Verschiebens: Undo-Protokoll
  nach jeder Datei auf die Platte geschrieben (fsync).
- Danach Verifikation jeder Datei (Ziel existiert, Quelle weg, Größe gleich).
"""

from __future__ import annotations

import csv
import json
import os
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import ClassVar

from pydantic import BaseModel, field_validator

from ..runner import RunCancelled, RunContext, Workflow, WorkflowError

CATEGORIES: dict[str, tuple[str, ...]] = {
    "Bilder": (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".tif", ".tiff", ".svg", ".raw", ".ico"),
    "PDFs": (".pdf",),
    "Dokumente": (".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".pages"),
    "Tabellen": (".xls", ".xlsx", ".ods", ".csv", ".numbers"),
    "Präsentationen": (".ppt", ".pptx", ".odp", ".key"),
    "Archive": (".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"),
    "Audio": (".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma"),
    "Video": (".mp4", ".mov", ".avi", ".mkv", ".wmv", ".webm", ".m4v"),
    "Installationsdateien": (".exe", ".msi", ".dmg", ".pkg", ".deb", ".appimage"),
    "Code": (".py", ".js", ".ts", ".tsx", ".java", ".cs", ".cpp", ".c", ".h", ".html", ".css", ".json", ".xml", ".yml", ".yaml", ".sql", ".ps1", ".sh"),
}
FALLBACK = "Sonstiges"
SKIP_NAMES = {"desktop.ini", "thumbs.db", ".ds_store"}

_WIN_FORBIDDEN = ("\\windows", "\\program files", "\\program files (x86)", "\\programdata")
_POSIX_FORBIDDEN = ("/", "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/root", "/sbin", "/sys", "/usr", "/var", "/System", "/Library", "/Applications")


def category_for(name: str) -> str:
    ext = Path(name).suffix.lower()
    for cat, exts in CATEGORIES.items():
        if ext in exts:
            return cat
    return FALLBACK


def validate_root(raw: str) -> Path:
    p = Path(raw)
    if not p.is_absolute():
        raise ValueError("Pfad muss absolut sein")
    if not p.exists() or not p.is_dir():
        raise ValueError("Ordner existiert nicht")
    root = p.resolve(strict=True)
    if root.parent == root:
        raise ValueError("Laufwerks-/Dateisystem-Wurzel ist nicht erlaubt")
    if root == Path.home().resolve():
        raise ValueError("Das Benutzerverzeichnis selbst ist nicht erlaubt – bitte einen Unterordner wählen")
    s = str(root)
    if sys.platform == "win32":
        tail = s[2:].lower() if len(s) > 2 and s[1] == ":" else s.lower()
        if any(tail == f or tail.startswith(f + "\\") for f in _WIN_FORBIDDEN):
            raise ValueError("Systemordner sind nicht erlaubt")
    elif s in _POSIX_FORBIDDEN or any(s.startswith(f + "/") for f in _POSIX_FORBIDDEN if f != "/"):
        raise ValueError("Systemordner sind nicht erlaubt")
    return root


@dataclass
class PlannedMove:
    name: str
    category: str
    target_name: str
    size: int
    mtime_ns: int


@dataclass
class JournalEntry:
    src: str
    dst: str
    size: int


def _unique_name(directory: Path, name: str, taken: set[str]) -> str:
    stem, suffix = Path(name).stem, Path(name).suffix
    candidate = name
    i = 1
    while candidate.lower() in taken or (directory / candidate).exists():
        candidate = f"{stem} ({i}){suffix}"
        i += 1
    taken.add(candidate.lower())
    return candidate


def scan(root: Path) -> list[os.DirEntry[str]]:
    entries = []
    with os.scandir(root) as it:
        for e in it:
            if e.name.startswith(".") or e.name.lower() in SKIP_NAMES:
                continue
            if e.is_symlink() or not e.is_file(follow_symlinks=False):
                continue
            entries.append(e)
    return sorted(entries, key=lambda e: e.name.lower())


def plan_moves(root: Path, entries: list[os.DirEntry[str]]) -> list[PlannedMove]:
    taken: dict[str, set[str]] = {}
    moves = []
    for e in entries:
        cat = category_for(e.name)
        st = e.stat(follow_symlinks=False)
        target = _unique_name(root / cat, e.name, taken.setdefault(cat, set()))
        moves.append(PlannedMove(e.name, cat, target, st.st_size, st.st_mtime_ns))
    return moves


def _ensure_category_dir(root: Path, category: str) -> tuple[Path, bool]:
    d = root / category
    if d.is_symlink():
        raise WorkflowError(f"„{category}“ ist eine Verknüpfung – aus Sicherheitsgründen abgebrochen")
    created = not d.exists()
    d.mkdir(exist_ok=True)
    if d.resolve().parent != root:
        raise WorkflowError("Zielordner liegt außerhalb des gewählten Ordners")
    return d, created


def _write_journal(path: Path, journal: dict) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(journal, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def journal_path(data_dir: Path, run_id: str) -> Path:
    return data_dir / "journals" / f"{run_id}.json"


class OrganizeInput(BaseModel):
    folder: str

    @field_validator("folder")
    @classmethod
    def _check(cls, v: str) -> str:
        return str(validate_root(v))


class OrganizeFolder(Workflow):
    name: ClassVar[str] = "organize_folder"
    agent_id: ClassVar[str] = "agent-sortierer"
    agent_name: ClassVar[str] = "Sortierer"
    capabilities: ClassVar[frozenset[str]] = frozenset({"files.read", "files.move"})
    Input = OrganizeInput

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, OrganizeInput)
        return f"Ordner „{Path(data.folder).name}“ sortieren"

    def resource_key(self, data: BaseModel) -> str | None:
        assert isinstance(data, OrganizeInput)
        return os.path.normcase(data.folder)

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, OrganizeInput)
        root = Path(data.folder)
        ctx.plan([("scan", "Ordnerinhalt einlesen"), ("plan", "Sortiervorschlag erstellen"), ("move", "Dateien verschieben"), ("verify", "Ergebnis prüfen")])

        ctx.step_started("scan", "Ordnerinhalt einlesen")
        entries = scan(root)
        ctx.step_succeeded("scan", f"{len(entries)} Dateien gefunden")
        if not entries:
            for sid, title in (("plan", "Sortiervorschlag erstellen"), ("move", "Dateien verschieben"), ("verify", "Ergebnis prüfen")):
                ctx.step_started(sid, title)
                ctx.step_succeeded(sid, "nichts zu tun")
            ctx.succeed(f"Geprüft: Im Ordner {root} liegen keine Dateien zum Sortieren. Es wurde nichts verändert.", "Keine Dateien zum Sortieren – nichts verändert.")
            return

        ctx.step_started("plan", "Sortiervorschlag erstellen")
        moves = plan_moves(root, entries)
        run_dir = ctx.data_dir / "runs" / ctx.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        plan_csv = run_dir / "Sortierplan.csv"
        with open(plan_csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["Datei", "Zielordner", "Neuer Name", "Größe (Bytes)"])
            for m in moves:
                w.writerow([m.name, m.category, m.target_name, m.size])
        ctx.artifact("table", "Sortierplan.csv", plan_csv)
        counts = Counter(m.category for m in moves)
        summary = ", ".join(f"{c} ({n})" for c, n in sorted(counts.items(), key=lambda x: -x[1]))
        renamed = sum(1 for m in moves if m.target_name != m.name)
        ctx.step_succeeded("plan", f"{len(moves)} Dateien → {len(counts)} Unterordner")

        decision = await ctx.approve(
            action="Dateien verschieben",
            target=str(root),
            data=f"{len(moves)} Dateien → {len(counts)} Unterordner: {summary}" + (f". {renamed} Datei(en) werden wegen Namensgleichheit umbenannt." if renamed else ""),
            impact="Dateien werden innerhalb dieses Ordners in Unterordner verschoben. Nichts wird gelöscht oder überschrieben. Ein Undo-Protokoll wird gespeichert; „Rückgängig machen“ ist danach möglich.",
        )
        if decision != "allow":
            ctx.cancelled("Freigabe abgelehnt – es wurde keine Datei verschoben")
            return

        ctx.step_started("move", "Dateien verschieben")
        jpath = journal_path(ctx.data_dir, ctx.run_id)
        jpath.parent.mkdir(parents=True, exist_ok=True)
        journal: dict = {"version": 1, "root": str(root), "runId": ctx.run_id, "createdDirs": [], "entries": [], "skipped": [], "undone": False}
        _write_journal(jpath, journal)
        try:
            for m in moves:
                ctx.check_cancel()
                src = root / m.name
                try:
                    st = src.stat(follow_symlinks=False)
                except FileNotFoundError:
                    journal["skipped"].append({"name": m.name, "reason": "nicht mehr vorhanden"})
                    continue
                if st.st_size != m.size or st.st_mtime_ns != m.mtime_ns:
                    journal["skipped"].append({"name": m.name, "reason": "seit Analyse verändert"})
                    continue
                directory, created = _ensure_category_dir(root, m.category)
                if created:
                    journal["createdDirs"].append(m.category)
                target_name = _unique_name(directory, m.target_name, set()) if (directory / m.target_name).exists() else m.target_name
                dst = directory / target_name
                if dst.exists():  # doppelte Absicherung: niemals überschreiben
                    journal["skipped"].append({"name": m.name, "reason": "Ziel existiert bereits"})
                    continue
                os.rename(src, dst)
                journal["entries"].append(asdict(JournalEntry(str(src), str(dst), m.size)))
                _write_journal(jpath, journal)
        except RunCancelled:
            _write_journal(jpath, journal)
            ctx.artifact("file", "Undo-Protokoll.json", jpath)
            ctx.cancelled(f"Gestoppt nach {len(journal['entries'])} von {len(moves)} Dateien. Rückgängig machen ist möglich.")
            return
        ctx.artifact("file", "Undo-Protokoll.json", jpath)
        ctx.step_succeeded("move", f"{len(journal['entries'])} verschoben, {len(journal['skipped'])} übersprungen")

        ctx.step_started("verify", "Ergebnis prüfen")
        bad = [
            e for e in journal["entries"]
            if not Path(e["dst"]).is_file() or Path(e["src"]).exists() or Path(e["dst"]).stat().st_size != e["size"]
        ]
        if bad:
            ctx.step_failed("verify", f"{len(bad)} Datei(en) nicht wie erwartet am Ziel")
            ctx.fail(f"Verifikation fehlgeschlagen für {len(bad)} Datei(en), z. B. {Path(bad[0]['src']).name}. Undo-Protokoll: {jpath}")
            return
        ctx.step_succeeded("verify", "alle Dateien am Ziel")
        skipped = f" {len(journal['skipped'])} übersprungen (verändert/fehlend)." if journal["skipped"] else ""
        moved = len(journal["entries"])
        folders = len({Path(e["dst"]).parent.name for e in journal["entries"]})
        ctx.succeed(
            f"{moved}/{moved} verschobene Dateien geprüft (Ziel vorhanden, Quelle leer, Größe gleich).{skipped} Undo-Protokoll gespeichert.",
            f"{moved} Datei{'en' if moved != 1 else ''} in {folders} Ordner sortiert." + (f" {len(journal['skipped'])} übersprungen." if journal["skipped"] else ""),
        )


class UndoInput(BaseModel):
    runId: str

    @field_validator("runId")
    @classmethod
    def _check(cls, v: str) -> str:
        if not v.startswith("run-") or not v[4:].isalnum():
            raise ValueError("Ungültige Run-ID")
        return v


class UndoOrganize(Workflow):
    name: ClassVar[str] = "undo_organize"
    agent_id: ClassVar[str] = "agent-sortierer"
    agent_name: ClassVar[str] = "Sortierer"
    capabilities: ClassVar[frozenset[str]] = frozenset({"files.move"})
    Input = UndoInput

    def title(self, data: BaseModel) -> str:
        return "Sortierung rückgängig machen"

    def resource_key(self, data: BaseModel) -> str | None:
        assert isinstance(data, UndoInput)
        return f"undo:{data.runId}"

    def related_run_id(self, data: BaseModel) -> str | None:
        assert isinstance(data, UndoInput)
        return data.runId

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, UndoInput)
        jpath = journal_path(ctx.data_dir, data.runId)
        ctx.plan([("check", "Undo-Protokoll prüfen"), ("restore", "Dateien zurückverschieben"), ("verify", "Ergebnis prüfen")])
        ctx.step_started("check", "Undo-Protokoll prüfen")
        if not jpath.is_file():
            raise WorkflowError("Für diesen Vorgang gibt es kein Undo-Protokoll")
        journal = json.loads(jpath.read_text(encoding="utf-8"))
        if journal.get("undone"):
            raise WorkflowError("Dieser Vorgang wurde bereits rückgängig gemacht")
        root = Path(journal["root"]).resolve()
        restorable = []
        for e in journal["entries"]:
            src, dst = Path(e["src"]), Path(e["dst"])
            # Pfade aus dem Protokoll nur innerhalb des ursprünglichen Ordners akzeptieren
            if src.parent.resolve() != root or dst.parent.parent.resolve() != root:
                raise WorkflowError("Undo-Protokoll enthält Pfade außerhalb des Ordners – abgebrochen")
            if dst.is_file() and not src.exists():
                restorable.append(e)
        ctx.step_succeeded("check", f"{len(restorable)} von {len(journal['entries'])} Dateien wiederherstellbar")
        if not restorable:
            raise WorkflowError("Keine der Dateien kann wiederhergestellt werden (verschoben, gelöscht oder Name belegt)")

        decision = await ctx.approve(
            action="Sortierung rückgängig machen",
            target=str(root),
            data=f"{len(restorable)} Dateien zurück in den Hauptordner" + (f"; {len(journal['entries']) - len(restorable)} nicht wiederherstellbar" if len(restorable) < len(journal["entries"]) else ""),
            impact="Dateien werden an ihren ursprünglichen Platz zurückverschoben. Leere, von NEXORA angelegte Unterordner werden entfernt. Nichts wird überschrieben.",
        )
        if decision != "allow":
            ctx.cancelled("Freigabe abgelehnt – nichts wurde verändert")
            return

        ctx.step_started("restore", "Dateien zurückverschieben")
        restored = []
        for e in restorable:
            ctx.check_cancel()
            if Path(e["src"]).exists():
                continue
            os.rename(e["dst"], e["src"])
            restored.append(e)
        removed_dirs = []
        for d in journal.get("createdDirs", []):
            p = root / d
            if p.is_dir() and not p.is_symlink() and not any(p.iterdir()):
                p.rmdir()
                removed_dirs.append(d)
        journal["undone"] = True
        _write_journal(jpath, journal)
        ctx.step_succeeded("restore", f"{len(restored)} Dateien zurückverschoben")

        ctx.step_started("verify", "Ergebnis prüfen")
        bad = [e for e in restored if not Path(e["src"]).is_file() or Path(e["dst"]).exists()]
        if bad:
            ctx.step_failed("verify", f"{len(bad)} Datei(en) nicht am Ursprungsort")
            ctx.fail(f"Verifikation fehlgeschlagen für {len(bad)} Datei(en)")
            return
        ctx.step_succeeded("verify", "alle Dateien am Ursprungsort")
        ctx.succeed(
            f"{len(restored)} Dateien am Ursprungsort geprüft; {len(removed_dirs)} leere Unterordner entfernt.",
            f"{len(restored)} Datei{'en' if len(restored) != 1 else ''} wieder an ihrem ursprünglichen Platz.",
        )

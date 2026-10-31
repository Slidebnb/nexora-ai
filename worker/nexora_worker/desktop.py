"""Desktop-Wahrnehmung und -Bedienung über die Windows-Bedienungshilfen (UI Automation).

Portiert aus ClawBridge (Apache-2.0, Copyright (c) 2026 RomaTek AI):
- `clawbridge/perception/accessibility.py`: ElementSnapshot, get_element_at_point, find_matching_element
- `clawbridge/platform/_windows.py`: enumerate_visible_windows, get_accessibility_tree (pywinauto UIA)

Änderungen gegenüber dem Original (Apache-2.0 §4b):
- Fenster wird über den exakten Titel gewählt statt „Vordergrundfenster“ (kein Raten, welches Programm gemeint ist)
- Passwortfelder werden erkannt (UIA IsPassword + Name) und weder gelesen noch beschrieben
- NEXORA bedient sich nicht selbst; Bedienung nur über UIA-Muster (Invoke/Value), keine freien Tastenkürzel
- Positionsbasiertes Raten (Strategie 4) bleibt für die Bedienung ausgeschlossen: Schwelle 0,85
- Rückgabewerte werden gekürzt und redigiert
"""

from __future__ import annotations

import math
import sys
from dataclasses import asdict, dataclass
from typing import Any, Protocol

from .safety import redact_text

INTERACTIVE_TYPES = frozenset({
    "Button", "Edit", "MenuItem", "ListItem", "TabItem", "ComboBox", "CheckBox",
    "RadioButton", "Hyperlink", "TreeItem", "DataItem", "Document", "Text",
})
# Für Ausführung: ab dieser Sicherheit gilt ein Element als wiedergefunden
CONTROL_THRESHOLD = 0.85
OWN_WINDOW_MARKERS = ("nexora",)


class DesktopError(Exception):
    pass


@dataclass(frozen=True)
class ElementSnapshot:
    control_type: str = ""
    name: str = ""
    automation_id: str = ""
    parent_name: str = ""
    left: int = 0
    top: int = 0
    right: int = 0
    bottom: int = 0
    is_password: bool = False

    @property
    def center(self) -> tuple[int, int]:
        return ((self.left + self.right) // 2, (self.top + self.bottom) // 2)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def describe(self) -> str:
        kind = {"Button": "Schaltfläche", "Edit": "Eingabefeld", "MenuItem": "Menüeintrag", "CheckBox": "Kontrollkästchen",
                "TabItem": "Registerkarte", "ListItem": "Listeneintrag", "Hyperlink": "Link", "Document": "Textbereich",
                "ComboBox": "Auswahlliste", "RadioButton": "Optionsfeld", "TreeItem": "Baumeintrag", "Text": "Text"}.get(self.control_type, self.control_type)
        label = self.name or self.automation_id or "ohne Namen"
        return f"{kind} „{label}“"


def get_element_at_point(x: int, y: int, tree: list[ElementSnapshot]) -> ElementSnapshot | None:
    """Kleinstes Element, das den Punkt enthält (aus ClawBridge übernommen)."""
    candidates = [((e.right - e.left) * (e.bottom - e.top), e) for e in tree if e.left <= x <= e.right and e.top <= y <= e.bottom]
    if not candidates:
        return None
    return min(candidates, key=lambda c: c[0])[1]


def find_matching_element(target: ElementSnapshot, candidates: list[ElementSnapshot], threshold: float = CONTROL_THRESHOLD) -> tuple[ElementSnapshot | None, float]:
    """Mehrstufiger Abgleich für die Wiedergabe (aus ClawBridge übernommen).

    1. automation_id exakt → 1,0
    2. Name + Typ + Elternname → 0,95
    3. Name + Typ → 0,85
    4. Typ + Nähe der Position → 0,6–0,8 (für die Bedienung unter der Schwelle)
    """
    best: ElementSnapshot | None = None
    best_conf = 0.0
    for el in candidates:
        conf = 0.0
        if target.automation_id and el.automation_id == target.automation_id and el.control_type == target.control_type:
            conf = 1.0
        elif target.name and el.name == target.name and el.control_type == target.control_type and target.parent_name and el.parent_name == target.parent_name:
            conf = 0.95
        elif target.name and el.name == target.name and el.control_type == target.control_type:
            conf = 0.85
        elif el.control_type == target.control_type:
            (tx, ty), (ex, ey) = target.center, el.center
            dist = math.hypot(tx - ex, ty - ey)
            if dist < 100:
                conf = max(0.6, 0.8 - dist / 500.0)
        if conf > best_conf:
            best, best_conf = el, conf
    return (best, best_conf) if best_conf >= threshold else (None, 0.0)


def is_own_window(title: str) -> bool:
    return any(m in title.lower() for m in OWN_WINDOW_MARKERS)


class DesktopBackend(Protocol):
    def list_windows(self) -> list[dict[str, Any]]: ...
    def elements(self, window: str, max_elements: int = 150) -> list[ElementSnapshot]: ...
    def invoke(self, window: str, element: ElementSnapshot) -> None: ...
    def set_text(self, window: str, element: ElementSnapshot, text: str) -> None: ...
    def read_text(self, window: str, element: ElementSnapshot) -> str: ...


class UnavailableBackend:
    """Andere Betriebssysteme: ehrliche Meldung statt Simulation."""

    @staticmethod
    def _no() -> Any:
        raise DesktopError("Die Desktop-Bedienung ist nur unter Windows verfügbar")

    def list_windows(self) -> list[dict[str, Any]]:
        return self._no()

    def elements(self, window: str, max_elements: int = 150) -> list[ElementSnapshot]:
        return self._no()

    def invoke(self, window: str, element: ElementSnapshot) -> None:
        self._no()

    def set_text(self, window: str, element: ElementSnapshot, text: str) -> None:
        self._no()

    def read_text(self, window: str, element: ElementSnapshot) -> str:
        return self._no()


class WindowsBackend:  # pragma: no cover – läuft nur unter Windows (CI-Job „Windows“)
    """pywinauto (BSD-3) mit UIA-Backend. Bedienung nur über UIA-Muster, keine Mausbewegung."""

    def __init__(self) -> None:
        try:
            from pywinauto import Desktop  # noqa: PLC0415
        except ImportError as e:
            raise DesktopError("Desktop-Bedienung nicht installiert (pywinauto fehlt)") from e
        self._desktop = Desktop(backend="uia")

    def list_windows(self) -> list[dict[str, Any]]:
        out = []
        for w in self._desktop.windows(visible_only=True):
            try:
                title = (w.window_text() or "").strip()
                if title and not is_own_window(title):
                    out.append({"title": title[:200], "pid": w.process_id()})
            except Exception:  # noqa: BLE001 – Fenster kann während der Abfrage verschwinden
                continue
        return out

    def _window(self, title: str) -> Any:
        if is_own_window(title):
            raise DesktopError("NEXORA bedient sich nicht selbst")
        matches = []
        for w in self._desktop.windows(visible_only=True):
            try:
                if (w.window_text() or "").strip() == title:
                    matches.append(w)
            except Exception:  # noqa: BLE001
                continue
        if not matches:
            raise DesktopError(f"Fenster „{title}“ nicht gefunden – ist das Programm geöffnet?")
        if len(matches) > 1:
            raise DesktopError(f"Mehrere Fenster heißen „{title}“ – bitte nur eines öffnen")
        return matches[0]

    @staticmethod
    def _snapshot(c: Any) -> ElementSnapshot | None:
        info = c.element_info
        ct = info.control_type
        if ct not in INTERACTIVE_TYPES:
            return None
        r = c.rectangle()
        if r.width() < 4 or r.height() < 4:
            return None
        name = (info.name or "").strip()[:120]
        auto_id = (info.automation_id or "")[:120]
        is_pwd = False
        try:
            is_pwd = bool(info.element.CurrentIsPassword)
        except Exception:  # noqa: BLE001
            pass
        is_pwd = is_pwd or (ct == "Edit" and "passw" in (name + auto_id).lower())
        parent = ""
        try:
            p = c.parent()
            parent = ((p.element_info.name or "") if p else "").strip()[:80]
        except Exception:  # noqa: BLE001
            pass
        return ElementSnapshot(ct, name, auto_id, parent, r.left, r.top, r.right, r.bottom, is_pwd)

    def _controls(self, window: str) -> list[tuple[ElementSnapshot, Any]]:
        win = self._window(window)
        out = []
        for c in win.descendants():
            try:
                snap = self._snapshot(c)
            except Exception:  # noqa: BLE001
                continue
            if snap:
                out.append((snap, c))
        return out

    def elements(self, window: str, max_elements: int = 150) -> list[ElementSnapshot]:
        return [s for s, _ in self._controls(window)][:max_elements]

    def _find(self, window: str, element: ElementSnapshot) -> tuple[ElementSnapshot, Any]:
        pairs = self._controls(window)
        match, _conf = find_matching_element(element, [s for s, _ in pairs])
        if not match:
            raise DesktopError(f"{element.describe()} nicht sicher wiedergefunden")
        return next(p for p in pairs if p[0] is match)

    def invoke(self, window: str, element: ElementSnapshot) -> None:
        snap, c = self._find(window, element)
        try:
            if snap.control_type == "CheckBox":
                c.toggle()
            elif snap.control_type in ("ListItem", "TabItem", "RadioButton", "TreeItem"):
                c.select()
            else:
                c.invoke()
        except Exception as e:  # noqa: BLE001
            raise DesktopError(f"{snap.describe()} lässt sich nicht auslösen ({type(e).__name__})") from e

    def set_text(self, window: str, element: ElementSnapshot, text: str) -> None:
        snap, c = self._find(window, element)
        if snap.is_password:
            raise DesktopError("In Passwortfelder schreibt NEXORA nicht")
        try:
            c.iface_value.SetValue(text)
        except Exception:  # noqa: BLE001
            try:
                c.set_edit_text(text)
            except Exception as e:  # noqa: BLE001
                raise DesktopError(f"In {snap.describe()} kann kein Text gesetzt werden ({type(e).__name__})") from e

    def read_text(self, window: str, element: ElementSnapshot) -> str:
        snap, c = self._find(window, element)
        if snap.is_password:
            raise DesktopError("Passwortfelder werden nicht gelesen")
        try:
            return str(c.iface_value.CurrentValue)
        except Exception:  # noqa: BLE001
            try:
                return "\n".join(c.texts())
            except Exception as e:  # noqa: BLE001
                raise DesktopError(f"Text aus {snap.describe()} nicht lesbar ({type(e).__name__})") from e


def default_backend() -> DesktopBackend:
    if sys.platform != "win32":
        return UnavailableBackend()
    try:
        return WindowsBackend()
    except DesktopError:
        return UnavailableBackend()


def public_element(e: ElementSnapshot) -> dict[str, Any]:
    """Für die Oberfläche: Namen redigiert, Passwortfelder markiert."""
    d = e.to_dict()
    d["name"] = redact_text(e.name)
    d["parent_name"] = redact_text(e.parent_name)
    d["label"] = ElementSnapshot(e.control_type, d["name"], e.automation_id).describe()
    return d

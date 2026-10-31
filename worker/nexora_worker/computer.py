"""KI-Bildschirmbedienung (Computer Use) – Hilfslogik ohne Netz und ohne Bildschirm.

Konzept aus ClawBridge `clawbridge/engines/computer_use_engine.py` (Apache-2.0, Copyright (c) 2026 RomaTek AI);
gesperrte Tastenkombinationen aus `clawbridge/platform/_windows.py` (_BLOCKED_KEY_COMBOS_WIN32).
Änderungen (Apache-2.0 §4b): aktuelles Werkzeug `computer_toolset_20260801` statt `computer_20241022`;
nur ein freigegebenes Fenster statt des ganzen Bildschirms; jede bedienende Aktion braucht eine Freigabe;
Koordinaten außerhalb des Fensters werden abgelehnt.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

TOOLSET = "computer"
TOOL_ENTRY = {"type": "computer_toolset_20260801"}
MAX_SIDE = 1568  # Bildschirmfoto wird vor dem Senden auf höchstens diese Kantenlänge verkleinert

READ_ONLY = frozenset({"screenshot", "zoom", "cursor_position", "wait"})
CONTROL = frozenset({
    "left_click", "right_click", "middle_click", "double_click", "triple_click", "left_click_drag",
    "mouse_move", "left_mouse_down", "left_mouse_up", "scroll", "type", "key", "hold_key",
})

# Aus ClawBridge übernommen (normalisiert: Teile sortiert, „+“-verbunden)
BLOCKED_COMBOS = frozenset({
    "r+win", "win+x", "alt+ctrl+delete", "alt+ctrl+del", "ctrl+esc+shift", "l+win", "pause+win", "alt+f4",
})

_ALIASES = {
    "control": "ctrl", "strg": "ctrl", "cmd": "win", "super": "win", "meta": "win", "windows": "win",
    "return": "enter", "escape": "esc", "del": "delete", "pgup": "pageup", "page_up": "pageup",
    "pgdn": "pagedown", "page_down": "pagedown", "arrowup": "up", "arrowdown": "down", "arrowleft": "left", "arrowright": "right",
}
_SPECIAL = {
    "enter": "{ENTER}", "tab": "{TAB}", "esc": "{ESC}", "backspace": "{BACKSPACE}", "delete": "{DELETE}", "space": "{SPACE}",
    "home": "{HOME}", "end": "{END}", "pageup": "{PGUP}", "pagedown": "{PGDN}", "up": "{UP}", "down": "{DOWN}",
    "left": "{LEFT}", "right": "{RIGHT}", "insert": "{INSERT}",
    **{f"f{i}": f"{{F{i}}}" for i in range(1, 13)},
}
_MODS = {"ctrl": "^", "alt": "%", "shift": "+"}


class ActionError(Exception):
    """Wird der KI als Fehler-Ergebnis zurückgemeldet (is_error)."""


def normalize_combo(combo: str) -> list[str]:
    c = combo.replace(" ", "")
    plus = c == "+" or c.endswith("++")  # die Plus-Taste selbst („+“, „ctrl++“)
    if plus:
        c = c[:-1]
    parts = [p.lower() for p in c.split("+") if p]
    return [_ALIASES.get(p, p) for p in parts] + (["+"] if plus else [])


def is_blocked(combo: str) -> bool:
    return "+".join(sorted(normalize_combo(combo))) in BLOCKED_COMBOS


def to_send_keys(combo: str) -> str:
    """xdotool-artige Namen („ctrl+s“, „Return“) → pywinauto send_keys. Windows-Taste und Unbekanntes: Fehler."""
    if is_blocked(combo):
        raise ActionError(f"Tastenkombination „{combo}“ ist aus Sicherheitsgründen gesperrt")
    parts = normalize_combo(combo)
    if not parts:
        raise ActionError("Leere Tastenangabe")
    *mods, key = parts
    prefix = ""
    for m in mods:
        if m not in _MODS:
            raise ActionError(f"Taste „{m}“ wird nicht unterstützt")
        prefix += _MODS[m]
    if key in _SPECIAL:
        return prefix + _SPECIAL[key]
    if len(key) == 1 and key.isprintable():
        return prefix + escape_text(key)
    raise ActionError(f"Taste „{key}“ wird nicht unterstützt")


def escape_text(text: str) -> str:
    """Zeichen, die send_keys als Steuerzeichen deutet, in geschweifte Klammern setzen."""
    out = []
    for ch in text:
        if ch in "{}+^%~()[]":
            out.append("{" + ch + "}")
        elif ch == "\n":
            out.append("{ENTER}")
        elif ch == "\t":
            out.append("{TAB}")
        else:
            out.append(ch)
    return "".join(out)


_VK_MODS = {"shift": "VK_SHIFT", "ctrl": "VK_CONTROL", "alt": "VK_MENU"}


def modifier_vks(text: str) -> list[str]:
    """Zusatztasten für Klick/Scroll („shift“, „ctrl+shift“) → pywinauto-VK-Namen. Windows-Taste: gesperrt."""
    parts = normalize_combo(text) if text else []
    out = []
    for m in parts:
        if m not in _VK_MODS:
            raise ActionError(f"Zusatztaste „{m}“ wird nicht unterstützt")
        out.append(_VK_MODS[m])
    return out


def hold_tokens(combo: str) -> tuple[str, str]:
    """Taste(n) gedrückt halten: (Drücken, Loslassen) als send_keys-Folge. Nur Sonder- und Zusatztasten."""
    if is_blocked(combo):
        raise ActionError(f"Tastenkombination „{combo}“ ist aus Sicherheitsgründen gesperrt")
    parts = normalize_combo(combo)
    if not parts:
        raise ActionError("Leere Tastenangabe")
    names = []
    for k in parts:
        if k in _VK_MODS:
            names.append(_VK_MODS[k])
        elif k in _SPECIAL:
            names.append(_SPECIAL[k].strip("{}"))
        else:
            raise ActionError(f"Taste „{k}“ kann nicht gehalten werden (nur Sonder- und Zusatztasten)")
    return "".join(f"{{{n} down}}" for n in names), "".join(f"{{{n} up}}" for n in reversed(names))


@dataclass(frozen=True)
class Frame:
    """Fensterausschnitt auf dem Bildschirm und Maßstab zwischen Bildschirmfoto und Bildschirm."""

    left: int
    top: int
    width: int
    height: int
    scale: float  # Bildschirmpixel je Foto-Pixel

    @property
    def shot_size(self) -> tuple[int, int]:
        return (round(self.width / self.scale), round(self.height / self.scale))

    def to_screen(self, coord: Any) -> tuple[int, int]:
        if not (isinstance(coord, (list, tuple)) and len(coord) == 2 and all(isinstance(v, (int, float)) for v in coord)):
            raise ActionError("Ungültige Koordinate")
        x, y = coord
        w, h = self.shot_size
        if not (0 <= x < w and 0 <= y < h):
            raise ActionError(f"Koordinate {list(coord)} liegt außerhalb des freigegebenen Fensters ({w}×{h})")
        return (self.left + round(x * self.scale), self.top + round(y * self.scale))


def frame_for(left: int, top: int, right: int, bottom: int) -> Frame:
    w, h = max(1, right - left), max(1, bottom - top)
    scale = max(1.0, max(w, h) / MAX_SIDE)
    return Frame(left, top, w, h, scale)


def describe_action(name: str, inp: dict[str, Any]) -> str:
    """Klartext für die Freigabe."""
    coord = inp.get("coordinate")
    at = f" bei {list(coord)}" if coord else ""
    mods = f" mit {inp['text']}" if name.endswith("click") and inp.get("text") else ""
    return {
        "left_click": f"Linksklick{at}{mods}",
        "right_click": f"Rechtsklick{at}{mods}",
        "middle_click": f"Mittelklick{at}{mods}",
        "double_click": f"Doppelklick{at}{mods}",
        "triple_click": f"Dreifachklick{at}{mods}",
        "left_click_drag": f"Ziehen von {inp.get('start_coordinate')} nach {coord}",
        "mouse_move": f"Maus bewegen{at}",
        "left_mouse_down": "Linke Maustaste drücken",
        "left_mouse_up": "Linke Maustaste loslassen",
        "scroll": f"{inp.get('scroll_amount', 1)}× scrollen ({ {'up': 'nach oben', 'down': 'nach unten', 'left': 'nach links', 'right': 'nach rechts'}.get(str(inp.get('scroll_direction')), '?')}){at}" + (f" mit {inp['text']}" if inp.get("text") else ""),
        "type": f"Text tippen: „{str(inp.get('text', ''))[:200]}“",
        "key": f"Taste {inp.get('text', '')}" + (f" ×{inp['repeat']}" if inp.get("repeat") else ""),
        "hold_key": f"Taste {inp.get('text', '')} {inp.get('duration', '?')} s halten",
    }.get(name, name)


def result(tool_use_id: str, content: Any, is_error: bool = False) -> dict[str, Any]:
    r: dict[str, Any] = {"type": "tool_result", "tool_use_id": tool_use_id, "toolset_name": TOOLSET, "content": content}
    if is_error:
        r["is_error"] = True
    return r


def image_content(png_b64: str) -> list[dict[str, Any]]:
    return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": png_b64}}]

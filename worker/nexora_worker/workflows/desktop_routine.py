"""Desktop-Ablauf: aufgezeichnete Schritte in einem Programmfenster wiedergeben (Masterplan Phase 5).

Entspricht Recorder/Replay aus ClawBridge, aber sicherer:
- Aufgezeichnet wird per Auswahl in NEXORA (Element anklicken → Schritt), nicht über einen globalen
  Tastatur-/Maus-Hook (ClawBridge nutzt pynput, LGPL, und zeichnet jede Taste auf).
- Wiedergabe über den Element-Abgleich aus ClawBridge (`find_matching_element`) mit Schwelle 0,85;
  Positionsraten ist ausgeschlossen.
- Vor der Ausführung eine Freigabe mit der vollständigen Schrittliste; jede Texteingabe wird zurückgelesen.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, ClassVar, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from ..desktop import DesktopBackend, DesktopError, ElementSnapshot, find_matching_element, is_own_window
from ..runner import RunContext, Workflow, WorkflowError


class ElementRef(BaseModel):
    control_type: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=120)
    automation_id: str = Field(default="", max_length=120)
    parent_name: str = Field(default="", max_length=80)
    left: int = 0
    top: int = 0
    right: int = 0
    bottom: int = 0

    @model_validator(mode="after")
    def _identifiable(self) -> ElementRef:
        if not (self.name or self.automation_id):
            raise ValueError("Element ohne Namen und ohne Automation-ID kann nicht sicher wiedergefunden werden")
        return self

    def snapshot(self) -> ElementSnapshot:
        return ElementSnapshot(self.control_type, self.name, self.automation_id, self.parent_name, self.left, self.top, self.right, self.bottom)


class DesktopStep(BaseModel):
    action: Literal["click", "type"]
    element: ElementRef
    text: str = Field(default="", max_length=5000)

    @model_validator(mode="after")
    def _text(self) -> DesktopStep:
        if self.action == "type" and not self.text:
            raise ValueError("Texteingabe ohne Text")
        return self


class DesktopInput(BaseModel):
    window: str = Field(min_length=1, max_length=200)
    steps: list[DesktopStep] = Field(min_length=1, max_length=30)

    @field_validator("window")
    @classmethod
    def _not_self(cls, v: str) -> str:
        if is_own_window(v):
            raise ValueError("NEXORA bedient sich nicht selbst")
        return v.strip()


def describe_step(step: DesktopStep) -> str:
    el = step.element.snapshot().describe()
    if step.action == "click":
        return f"{el} auslösen"
    preview = step.text if len(step.text) <= 40 else step.text[:40] + "…"
    return f"„{preview}“ in {el} eintragen"


class DesktopRoutine(Workflow):
    name: ClassVar[str] = "desktop_routine"
    agent_id: ClassVar[str] = "agent-desktop"
    agent_name: ClassVar[str] = "Desktop-Assistent"
    capabilities: ClassVar[frozenset[str]] = frozenset({"desktop.read", "desktop.control"})
    Input = DesktopInput

    def __init__(self, backend: DesktopBackend) -> None:
        self.backend = backend

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, DesktopInput)
        return f"Desktop-Ablauf in „{data.window[:60]}“ ({len(data.steps)} Schritte)"

    def resource_key(self, data: BaseModel) -> str | None:
        return "desktop"  # immer nur ein Ablauf zur Zeit: Programme teilen sich den Bildschirm

    @staticmethod
    async def _call(fn: Callable[..., Any], *args: Any) -> Any:
        try:
            return await asyncio.to_thread(fn, *args)
        except DesktopError as e:
            raise WorkflowError(str(e)) from e

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, DesktopInput)
        steps = [(f"s{i}", describe_step(s)) for i, s in enumerate(data.steps, 1)]
        ctx.plan([("find", "Fenster und Elemente finden")] + steps + [("verify", "Ergebnis prüfen")])

        ctx.step_started("find", "Fenster und Elemente finden")
        elements: list[ElementSnapshot] = await self._call(self.backend.elements, data.window, 500)
        matches = [find_matching_element(s.element.snapshot(), elements)[0] for s in data.steps]
        missing = [s for s, m in zip(data.steps, matches) if m is None]
        if missing:
            ctx.step_failed("find", f"{len(missing)} Element(e) nicht gefunden")
            raise WorkflowError(f"Nicht gefunden: {missing[0].element.snapshot().describe()} – hat sich das Programm verändert?")
        if any(s.action == "type" and m is not None and m.is_password for s, m in zip(data.steps, matches)):
            ctx.step_failed("find", "Passwortfeld im Ablauf")
            raise WorkflowError("In Passwortfelder schreibt NEXORA nicht")
        ctx.step_succeeded("find", f"Fenster „{data.window}“: {len(data.steps)} von {len(data.steps)} Elementen gefunden")

        decision = await ctx.approve(
            action="Programm bedienen",
            target=data.window,
            data="\n".join(f"{i}. {t}" for i, (_, t) in enumerate(steps, 1)),
            impact="NEXORA bedient das Programm wie mit Maus und Tastatur. Was das Programm daraufhin tut (z. B. speichern, senden), "
            "kann NEXORA nicht rückgängig machen.",
        )
        if decision != "allow":
            ctx.cancelled("Bedienung abgelehnt – nichts wurde ausgeführt")
            return

        typed = typed_ok = 0
        for (sid, title), step in zip(steps, data.steps):
            await ctx.checkpoint()
            ctx.step_started(sid, title)
            el = step.element.snapshot()
            if step.action == "click":
                await self._call(self.backend.invoke, data.window, el)
                ctx.step_succeeded(sid, "ausgelöst")
                continue
            typed += 1
            await self._call(self.backend.set_text, data.window, el, step.text)
            back = await self._call(self.backend.read_text, data.window, el)
            if str(back).replace("\r\n", "\n").replace("\r", "\n") != step.text.replace("\r\n", "\n"):
                ctx.step_failed(sid, "Text wurde nicht vollständig übernommen")
                raise WorkflowError(f"Prüfung fehlgeschlagen: {el.describe()} enthält nicht den eingetragenen Text")
            typed_ok += 1
            ctx.step_succeeded(sid, "eingetragen und zurückgelesen")

        ctx.step_started("verify", "Ergebnis prüfen")
        clicks = len(data.steps) - typed
        ctx.step_succeeded("verify", f"{typed_ok}/{typed} Texte bestätigt")
        ctx.succeed(
            f"{len(data.steps)} von {len(data.steps)} Schritten ausgeführt: {typed_ok}/{typed} Texteingaben zurückgelesen und gleich; "
            f"{clicks} Auslösung(en) ohne Fehlermeldung des Programms (deren Wirkung prüft NEXORA nicht).",
            f"Ablauf in „{data.window}“ erledigt ({len(data.steps)} Schritte).",
        )

"""MVP-Workflow 4: Entwurf statt Versand – E-Mail-Entwürfe als .eml-Dateien, nie automatischer Versand.

- .eml mit „X-Unsent: 1“: Outlook öffnet sie als Entwurf; der Nutzer prüft und versendet selbst.
- Speichern in den gewählten Ordner nur nach Freigabe; nichts wird überschrieben.
- Optional KI-Text: nur mit „ai.cloud“ und Freigabe vor dem Senden des Briefings.
- Kopfzeilen werden gegen Header-Injection geschützt (keine Zeilenumbrüche, gültige Adressen).
"""

from __future__ import annotations

import asyncio
import os
import re
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import formataddr
from pathlib import Path
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator

from ..llm import LlmError, draft_body, price, provider_for
from ..runner import RunContext, Workflow, WorkflowError
from ..safety import redact_text
from .organizer import validate_root

EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
SAFE_NAME = re.compile(r"[^\w\-. ]", re.UNICODE)


class Recipient(BaseModel):
    name: str = Field(default="", max_length=120)
    email: str

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        if "\r" in v or "\n" in v:
            raise ValueError("Name enthält Zeilenumbrüche")
        return v.strip()

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if not EMAIL.match(v):
            raise ValueError(f"Ungültige E-Mail-Adresse: {v}")
        return v


class DraftInput(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    briefing: str = Field(min_length=10, max_length=5000)
    recipients: list[Recipient] = Field(min_length=1, max_length=50)
    outFolder: str
    useCloudAi: bool = False

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        if "\r" in v or "\n" in v:
            raise ValueError("Betreff enthält Zeilenumbrüche")
        return v.strip()

    @field_validator("outFolder")
    @classmethod
    def _out(cls, v: str) -> str:
        return str(validate_root(v))


def greeting(r: Recipient) -> str:
    return f"Hallo {r.name}," if r.name else "Hallo,"


def local_body(briefing: str) -> str:
    """Ohne KI: Briefing wird sauber als Nachrichtentext übernommen (Nutzer formuliert selbst nach)."""
    text = re.sub(r"\n{3,}", "\n\n", briefing.strip())
    return f"{text}\n\nViele Grüße"


def build_eml(subject: str, r: Recipient, body: str) -> bytes:
    msg = EmailMessage(policy=policy.SMTP)
    msg["To"] = formataddr((r.name, r.email)) if r.name else r.email
    msg["Subject"] = subject
    msg["X-Unsent"] = "1"  # Outlook: als Entwurf öffnen
    msg["X-Generated-By"] = "NEXORA AI (Entwurf, nicht versendet)"
    msg.set_content(f"{greeting(r)}\n\n{body}\n", charset="utf-8")
    return msg.as_bytes()


def file_name(i: int, r: Recipient) -> str:
    base = SAFE_NAME.sub("_", r.name or r.email.split("@")[0]).strip() or "Empfaenger"
    return f"Entwurf {i:02d} - {base[:60]}.eml"


class DraftEmails(Workflow):
    name: ClassVar[str] = "draft_emails"
    agent_id: ClassVar[str] = "agent-schreiber"
    agent_name: ClassVar[str] = "Schreiber"
    capabilities: ClassVar[frozenset[str]] = frozenset({"drafts.write", "files.write"})
    Input = DraftInput

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, DraftInput)
        return f"{len(data.recipients)} Entwurf/Entwürfe: {data.subject[:50]}"

    def required_capabilities(self, data: BaseModel) -> frozenset[str]:
        assert isinstance(data, DraftInput)
        return self.capabilities | ({"ai.cloud"} if data.useCloudAi else frozenset())

    def resource_key(self, data: BaseModel) -> str | None:
        assert isinstance(data, DraftInput)
        return os.path.normcase(data.outFolder)

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, DraftInput)
        out = Path(data.outFolder)
        ctx.plan([("check", "Empfänger prüfen"), ("write", "Entwürfe formulieren"), ("save", "Entwürfe speichern"), ("verify", "Entwürfe prüfen")])

        ctx.step_started("check", "Empfänger prüfen")
        seen: set[str] = set()
        recipients = []
        for r in data.recipients:
            if r.email.lower() not in seen:
                seen.add(r.email.lower())
                recipients.append(r)
        ctx.step_succeeded("check", f"{len(recipients)} Empfänger" + (f", {len(data.recipients) - len(recipients)} doppelt entfernt" if len(recipients) < len(data.recipients) else ""))

        ctx.step_started("write", "Entwürfe formulieren")
        body, by = local_body(data.briefing), "lokal (Briefing übernommen)"
        if data.useCloudAi:
            provider = provider_for(ctx.secrets)
            if provider is None:
                ctx.step_failed("write", "Kein API-Schlüssel – Briefing wird lokal übernommen")
                ctx.step_started("write", "Entwürfe formulieren (lokal)")
            else:
                decision = await ctx.approve(
                    action="Briefing an KI-Anbieter senden",
                    target="Anthropic" if provider == "anthropic" else "OpenAI",
                    data=f"Briefing mit {len(data.briefing)} Zeichen (ohne Empfängeradressen)",
                    impact="Der Briefing-Text verlässt deinen Rechner. Es fallen API-Kosten an. Es wird nichts versendet.",
                )
                if decision == "allow":
                    try:
                        res = await asyncio.to_thread(draft_body, data.briefing, ctx.secrets)
                        ctx.cost(price(res))
                        body, by = redact_text(res.text), f"{res.provider} {res.model} ({res.input_tokens}+{res.output_tokens} Token)"
                    except LlmError as e:
                        ctx.step_failed("write", f"{e} – Briefing wird lokal übernommen")
                        ctx.step_started("write", "Entwürfe formulieren (lokal)")
        drafts = [(file_name(i, r), r, build_eml(data.subject, r, body)) for i, r in enumerate(recipients, 1)]
        run_dir = ctx.data_dir / "runs" / ctx.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        preview = run_dir / "Entwurfsvorschau.txt"
        preview.write_text(f"Betreff: {data.subject}\nText erstellt: {by}\n\n{greeting(recipients[0])}\n\n{body}\n", encoding="utf-8")
        ctx.artifact("file", "Entwurfsvorschau.txt", preview)
        ctx.step_succeeded("write", f"{len(drafts)} Entwürfe ({by})")

        listing = ", ".join(r.email for _, r, _ in drafts[:5]) + (f" … (+{len(drafts) - 5})" if len(drafts) > 5 else "")
        decision = await ctx.approve(
            action="E-Mail-Entwürfe speichern",
            target=str(out),
            data=f"{len(drafts)} .eml-Dateien an: {listing}. Betreff: „{data.subject}“",
            impact="Es werden nur Entwurfsdateien angelegt – es wird NICHTS versendet. Öffnen mit Outlook/Thunderbird, prüfen und selbst senden.",
        )
        if decision != "allow":
            ctx.cancelled("Freigabe abgelehnt – keine Entwürfe gespeichert, nichts versendet")
            return

        ctx.step_started("save", "Entwürfe speichern")
        written: list[Path] = []
        for name, _r, eml in drafts:
            await ctx.checkpoint()
            target = out / name
            stem, n = target.stem, 1
            while target.exists():
                target = out / f"{stem} ({n}).eml"
                n += 1
            with open(target, "xb") as f:  # „x“: niemals überschreiben
                f.write(eml)
            written.append(target)
        ctx.step_succeeded("save", f"{len(written)} Dateien in {out}")

        ctx.step_started("verify", "Entwürfe prüfen")
        problems = []
        for path, (_, r, _) in zip(written, drafts):
            msg = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
            if r.email not in str(msg["To"]) or msg["Subject"] != data.subject or msg["X-Unsent"] != "1":
                problems.append(path.name)
        if problems:
            ctx.step_failed("verify", f"{len(problems)} Entwurf/Entwürfe fehlerhaft")
            ctx.fail(f"Prüfung fehlgeschlagen: {', '.join(problems[:3])}")
            return
        ctx.artifact("file", written[0].name, written[0])
        ctx.step_succeeded("verify", "Empfänger, Betreff und Entwurfskennzeichen geprüft")
        ctx.succeed(
            f"{len(written)} Entwürfe in {out} gespeichert und geprüft (Empfänger, Betreff, X-Unsent). Nichts wurde versendet.",
            f"{len(written)} Entwurf{'e' if len(written) != 1 else ''} gespeichert – nichts wurde gesendet.",
        )

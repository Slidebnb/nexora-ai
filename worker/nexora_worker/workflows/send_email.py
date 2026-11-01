"""E-Mail wirklich senden (SMTP) – mit Freigabe vor jedem Versand.

- Zugangsdaten (SMTP-Server, Benutzer, Passwort, Absender) kommen aus dem sicheren Speicher der App und
  werden je Sitzung als JSON unter dem Secret-Schlüssel „smtp“ an den Worker übergeben – nie in der Datenbank.
- Berechtigung „email.send“ UND eine Freigabe je E-Mail: Vor dem Senden sieht der Nutzer Empfänger, Betreff und
  eine Vorschau. Erst nach „Erlauben“ wird gesendet.
- Kopfzeilen-Schutz über Pydantic (keine Zeilenumbrüche in Betreff/Name) und EmailMessage.
"""

from __future__ import annotations

import json
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import ClassVar, Literal, Protocol

from pydantic import BaseModel, Field, field_validator

from .drafts import EMAIL, Recipient
from ..runner import RunContext, Workflow, WorkflowError


class SmtpConfig(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    security: Literal["ssl", "starttls", "none"] = "starttls"
    user: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    fromAddr: str

    @field_validator("fromAddr")
    @classmethod
    def _from(cls, v: str) -> str:
        v = v.strip()
        if not EMAIL.match(v):
            raise ValueError(f"Ungültige Absenderadresse: {v}")
        return v


class SendInput(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)
    recipients: list[Recipient] = Field(min_length=1, max_length=50)

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        if "\r" in v or "\n" in v:
            raise ValueError("Betreff enthält Zeilenumbrüche")
        return v.strip()


class Sender(Protocol):
    def send(self, cfg: SmtpConfig, msg: EmailMessage) -> None: ...
    def verify(self, cfg: SmtpConfig) -> None: ...


class SmtpSender:
    """Echter Versand über smtplib (TLS/STARTTLS)."""

    def _connect(self, cfg: SmtpConfig):  # noqa: ANN202 – Kontextmanager der jeweiligen SMTP-Klasse
        ctx = ssl.create_default_context()
        if cfg.security == "ssl":
            return smtplib.SMTP_SSL(cfg.host, cfg.port, context=ctx, timeout=30)
        s = smtplib.SMTP(cfg.host, cfg.port, timeout=30)
        if cfg.security == "starttls":
            s.starttls(context=ctx)
        return s

    def send(self, cfg: SmtpConfig, msg: EmailMessage) -> None:  # pragma: no cover – echtes Netz
        with self._connect(cfg) as s:
            s.login(cfg.user, cfg.password)
            s.send_message(msg)

    def verify(self, cfg: SmtpConfig) -> None:  # pragma: no cover – echtes Netz
        with self._connect(cfg) as s:
            s.login(cfg.user, cfg.password)


def build_message(cfg: SmtpConfig, data: SendInput, r: Recipient) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = cfg.fromAddr
    msg["To"] = formataddr((r.name, r.email)) if r.name else r.email
    msg["Subject"] = data.subject
    greeting = f"Hallo {r.name}," if r.name else "Hallo,"
    msg.set_content(f"{greeting}\n\n{data.body}\n", charset="utf-8")
    return msg


class SendEmail(Workflow):
    name: ClassVar[str] = "send_email"
    agent_id: ClassVar[str] = "agent-schreiber"
    agent_name: ClassVar[str] = "Schreiber"
    capabilities: ClassVar[frozenset[str]] = frozenset({"email.send"})
    Input = SendInput

    def __init__(self, sender: Sender | None = None) -> None:
        self.sender = sender or SmtpSender()

    def title(self, data: BaseModel) -> str:
        assert isinstance(data, SendInput)
        return f"E-Mail senden an {len(data.recipients)} Empfänger: {data.subject[:50]}"

    def _config(self, ctx: RunContext) -> SmtpConfig:
        raw = ctx.secrets.get("smtp")
        if not raw:
            raise WorkflowError("Kein E-Mail-Konto eingerichtet (Einstellungen → E-Mail-Konto zum Senden).")
        try:
            return SmtpConfig.model_validate(json.loads(raw))
        except Exception as e:  # noqa: BLE001
            raise WorkflowError("E-Mail-Konto ist unvollständig eingerichtet.") from e

    async def run(self, ctx: RunContext, data: BaseModel) -> None:
        assert isinstance(data, SendInput)
        cfg = self._config(ctx)
        to_list = ", ".join(r.email for r in data.recipients)
        ctx.plan([("approve", "Versand freigeben"), ("send", "E-Mail senden"), ("verify", "Bestätigen")])

        ctx.step_started("approve", "Versand freigeben")
        preview = data.body[:300] + ("…" if len(data.body) > 300 else "")
        decision = await ctx.approve(
            action="E-Mail senden",
            target=to_list,
            data=f"Betreff: {data.subject}\nVon: {cfg.fromAddr}\n\n{preview}",
            impact="Die E-Mail wird jetzt wirklich an die Empfänger gesendet. Das lässt sich nicht rückgängig machen.",
        )
        if decision != "allow":
            ctx.cancelled("Nicht freigegeben – es wurde nichts gesendet")
            return
        ctx.step_succeeded("approve", "freigegeben")

        ctx.step_started("send", "E-Mail senden")
        import asyncio  # noqa: PLC0415

        sent = 0
        errors: list[str] = []
        for r in data.recipients:
            await ctx.checkpoint()
            try:
                await asyncio.to_thread(self.sender.send, cfg, build_message(cfg, data, r))
                sent += 1
            except (smtplib.SMTPException, OSError, ssl.SSLError) as e:
                errors.append(f"{r.email}: {type(e).__name__}")
        if sent == 0:
            ctx.step_failed("send", "Versand fehlgeschlagen")
            raise WorkflowError(f"Keine E-Mail konnte gesendet werden. {errors[0] if errors else ''}".strip())
        ctx.step_succeeded("send", f"{sent} gesendet")
        ctx.step_started("verify", "Bestätigen")
        ctx.step_succeeded("verify", "ok")
        note = f" {len(errors)} fehlgeschlagen ({'; '.join(errors)[:200]})." if errors else ""
        ctx.succeed(
            f"{sent} von {len(data.recipients)} E-Mail(s) über {cfg.host} gesendet.{note}",
            f"E-Mail an {sent} Empfänger gesendet.",
        )

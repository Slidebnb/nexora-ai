"""Sicherheitsrichtlinie: Aktionsklassen, Erkennung/Schwärzung sensibler Inhalte, Prompt-Injection.

Portiert aus NickRomanek/clawbridge @ a8a06c2 – clawbridge/policy/safety.py
Lizenz: Apache-2.0 (Repository enthält zusätzlich eine MIT-Lizenzdatei), Copyright (c) 2026 RomaTek AI.
GEÄNDERT für NEXORA (Apache-2.0 §4b):
- Kein „permissive“-Modus: Schreib-, Sende-, Lösch- und Desktop-Aktionen erfordern IMMER eine Freigabe.
- Neue Aktionsklassen für Dateioperationen (move/delete/write) und Versand (send).
- Redaktion arbeitet rekursiv auf Payload-Strukturen; zusätzliche Muster (IBAN, E-Mail-Header-Auth).
- Domainprüfung über echte Host-Suffixe statt Teilstring (verhindert „paypal.com.evil.tld“-Fehlklassifikation).
- Prompt-Injection-Treffer werden als Daten-Markierung zurückgegeben; Webtext wird nie als Anweisung genutzt.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Any
from urllib.parse import urlparse


class ActionClass(str, Enum):
    SAFE_READ = "safe_read"
    SENSITIVE_WRITE = "sensitive_write"
    HIGH_RISK = "high_risk"


CREDENTIAL_PATTERNS = [
    re.compile(r"(?i)(password|passwd|pwd|passwort|kennwort)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(access[_-]?token|auth[_-]?token|bearer)\s*[:=]?\s*[A-Za-z0-9._\-]{16,}"),
    re.compile(r"(?i)(private[_-]?key)\s*[:=]\s*\S+"),
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{36}"),
    re.compile(r"xox[bsapr]-[A-Za-z0-9-]+"),
]

PII_PATTERNS = [
    re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"),  # Kreditkarte
    re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b"),  # IBAN
]

PASSWORD_FIELD_INDICATORS = [
    'type="password"',
    "type='password'",
    'autocomplete="current-password"',
    'autocomplete="new-password"',
]

SENSITIVE_HOSTS = {
    "accounts.google.com",
    "login.microsoftonline.com",
    "login.live.com",
    "signin.aws.amazon.com",
    "console.cloud.google.com",
    "github.com",
}
HIGH_RISK_HOSTS = {"paypal.com", "venmo.com", "stripe.com", "klarna.com"}
HIGH_RISK_HOST_WORDS = ("bank", "banking", "sparkasse", "volksbank")

READ_ACTIONS = {"navigate", "read", "extract", "summarize", "screenshot", "scan", "list"}
WRITE_ACTIONS = {"click", "type", "submit", "select", "write", "move", "rename", "mkdir"}
HIGH_RISK_ACTIONS = {
    "upload", "download", "clipboard", "exec", "launch", "delete", "send", "purchase", "publish",
    "mouse_move", "left_click", "right_click", "double_click", "key_press", "desktop_type",
}


def host_of(target: str) -> str:
    try:
        if "://" in target:
            return (urlparse(target).hostname or "").lower()
    except ValueError:
        return ""
    return ""


def _host_matches(host: str, candidates: set[str]) -> bool:
    return any(host == c or host.endswith("." + c) for c in candidates)


def classify_action(action: str, target: str = "") -> ActionClass:
    a = action.lower()
    if a in READ_ACTIONS:
        cls = ActionClass.SAFE_READ
    elif a in HIGH_RISK_ACTIONS:
        cls = ActionClass.HIGH_RISK
    else:
        cls = ActionClass.SENSITIVE_WRITE  # unbekannt oder Schreibaktion: nie automatisch
    host = host_of(target)
    if host and (_host_matches(host, HIGH_RISK_HOSTS) or any(w in host.split(".")[0] for w in HIGH_RISK_HOST_WORDS)):
        cls = ActionClass.HIGH_RISK
    elif host and _host_matches(host, SENSITIVE_HOSTS) and cls == ActionClass.SAFE_READ:
        cls = ActionClass.SENSITIVE_WRITE
    if any(i in target.lower() for i in PASSWORD_FIELD_INDICATORS):
        cls = ActionClass.HIGH_RISK
    return cls


def requires_approval(action: str, target: str = "") -> bool:
    """NEXORA-Regel: alles außer reinem Lesen braucht eine Freigabe."""
    return classify_action(action, target) != ActionClass.SAFE_READ


def detect_sensitive_content(text: str) -> list[str]:
    found: list[str] = []
    if any(p.search(text) for p in CREDENTIAL_PATTERNS):
        found.append("credential_pattern")
    if any(p.search(text) for p in PII_PATTERNS):
        found.append("pii_pattern")
    if any(i in text.lower() for i in PASSWORD_FIELD_INDICATORS):
        found.append("password_field")
    return found


def redact_text(text: str) -> str:
    for p in CREDENTIAL_PATTERNS:
        text = p.sub("[GESCHWÄRZT:ZUGANGSDATEN]", text)
    for p in PII_PATTERNS:
        text = p.sub("[GESCHWÄRZT:PII]", text)
    return text


def redact(value: Any) -> Any:
    """Schwärzt rekursiv alle Strings in Dicts/Listen (für Events und Logs)."""
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    return value


PROMPT_INJECTION_PATTERNS = [
    re.compile(r"(?i)ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)"),
    re.compile(r"(?i)ignoriere\s+(alle\s+)?(vorherigen|obigen)\s+(anweisungen|regeln)"),
    re.compile(r"(?i)you\s+are\s+now\s+"),
    re.compile(r"(?i)^\s*system\s*:", re.MULTILINE),
    re.compile(r"(?i)forget\s+(everything|all|your)\s+"),
    re.compile(r"(?i)disregard\s+(previous|above|all)\s+"),
    re.compile(r"(?i)new\s+instructions?\s*:"),
    re.compile(r"(?i)override\s+(previous|system)\s+"),
]


def scan_for_prompt_injection(text: str) -> list[str]:
    """Markiert verdächtige Webinhalte. Blockiert nicht – Webtext ist ohnehin nur Daten."""
    return [p.pattern[:60] for p in PROMPT_INJECTION_PATTERNS if p.search(text)]

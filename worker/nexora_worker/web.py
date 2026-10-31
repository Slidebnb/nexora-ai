"""Abruf öffentlicher Webseiten und Textextraktion – ohne KI, ohne JavaScript.

Sicherheit:
- Nur http/https; Ziel-IP muss öffentlich sein (kein localhost, privates Netz, Link-Local) – auch nach Weiterleitungen.
- Größenlimit, Zeitlimit, nur Text/HTML.
- Webinhalt ist Daten: Prompt-Injection-Muster werden markiert, niemals ausgeführt.
"""

from __future__ import annotations

import ipaddress
import os
import re
import socket
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx

from .safety import redact_text, scan_for_prompt_injection

MAX_BYTES = 2_000_000
TIMEOUT = 15.0
MAX_REDIRECTS = 5
USER_AGENT = "NEXORA-AI/0.1 (lokaler Recherche-Assistent; +https://example.invalid/nexora)"


class WebError(Exception):
    pass


def _allow_private() -> bool:
    # Nur für automatisierte Tests mit lokalem Testserver.
    return os.environ.get("NEXORA_ALLOW_PRIVATE_URLS") == "1"


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise WebError("Nur http- und https-Adressen sind erlaubt")
    if parsed.username or parsed.password:
        raise WebError("Adressen mit Zugangsdaten sind nicht erlaubt")
    if _allow_private():
        return
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise WebError(f"Adresse nicht auflösbar: {parsed.hostname}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise WebError(f"Interne Netzadresse nicht erlaubt: {parsed.hostname}")


class _Extractor(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.h1: list[str] = []
        self.text: list[str] = []
        self._stack: list[str] = []
        self._in_title = False
        self._in_h1 = False
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIP:
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "h1":
            self._in_h1 = True
            self.h1.append("")
        elif tag == "meta":
            a = {k.lower(): (v or "") for k, v in attrs}
            if a.get("name", "").lower() == "description" or a.get("property", "").lower() == "og:description":
                self.description = self.description or a.get("content", "")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        elif tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._in_h1 = False
        elif tag in ("p", "div", "li", "br", "h2", "h3", "tr", "section", "article"):
            self.text.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._in_title:
            self.title += data
        if self._in_h1 and self.h1:
            self.h1[-1] += data
        self.text.append(data)


@dataclass
class Page:
    url: str
    final_url: str
    status: int
    fetched_at: str
    title: str
    description: str
    h1: str
    text: str
    warnings: list[str] = field(default_factory=list)


def _clean(s: str, limit: int) -> str:
    return re.sub(r"\s+", " ", s).strip()[:limit]


def fetch_page(url: str, client: httpx.Client | None = None) -> Page:
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": USER_AGENT})
    try:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            assert_public_url(current)
            with client.stream("GET", current) as r:
                if r.is_redirect and "location" in r.headers:
                    current = urljoin(current, r.headers["location"])
                    continue
                if r.status_code >= 400:
                    raise WebError(f"HTTP {r.status_code}")
                ctype = r.headers.get("content-type", "")
                if "html" not in ctype and "text" not in ctype:
                    raise WebError(f"Kein HTML/Text ({ctype or 'unbekannt'})")
                body = b""
                for chunk in r.iter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        raise WebError("Seite zu groß (>2 MB)")
                status = r.status_code
                encoding = r.encoding or "utf-8"
                break
        else:
            raise WebError("Zu viele Weiterleitungen")
    except httpx.HTTPError as e:
        raise WebError(f"Abruf fehlgeschlagen: {type(e).__name__}") from e
    finally:
        if own:
            client.close()
    html = body.decode(encoding, errors="replace")
    ex = _Extractor()
    ex.feed(html)
    text = _clean("".join(ex.text), 200_000)
    warnings = []
    if scan_for_prompt_injection(text):
        warnings.append("Seite enthält anweisungsähnlichen Text (als Daten behandelt)")
    return Page(
        url=url,
        final_url=current,
        status=status,
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        title=redact_text(_clean(ex.title, 300)),
        description=redact_text(_clean(ex.description, 500)),
        h1=redact_text(_clean(" | ".join(h for h in ex.h1 if h.strip()), 300)),
        text=redact_text(text),
        warnings=warnings,
    )


_WORD = re.compile(r"[\wäöüÄÖÜß]{4,}", re.UNICODE)


def keywords(question: str) -> list[str]:
    stop = {"welche", "welcher", "welches", "wieviel", "werden", "haben", "sind", "einer", "eines", "diese", "dieser", "über", "with", "what", "which", "from", "that", "this"}
    seen: list[str] = []
    for w in _WORD.findall(question.lower()):
        if w not in stop and w not in seen:
            seen.append(w)
    return seen


def best_snippet(text: str, words: list[str], limit: int = 300) -> tuple[str, int]:
    """Satz mit den meisten Treffern und Gesamtanzahl der Treffer."""
    if not words:
        return "", 0
    lower = text.lower()
    total = sum(lower.count(w) for w in words)
    best, best_score = "", 0
    for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
        s = sentence.lower()
        score = sum(1 for w in words if w in s)
        if score > best_score:
            best, best_score = sentence.strip(), score
    return best[:limit], total

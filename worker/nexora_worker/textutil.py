"""Lokale, KI-freie Textauswertung: Kernbegriffe und extraktive Zusammenfassung."""

from __future__ import annotations

import re
from collections import Counter

STOP = set(
    """aber alle allem allen aller alles als also am an ander andere anderem anderen anderer anderes auch auf aus bei bin bis bist da damit dann
    das dass dein deine dem den denn der des dessen dich die dies diese diesem diesen dieser dieses dir doch dort du durch ein eine einem einen
    einer eines einig einige er es etwas euer eure für gegen gewesen hab habe haben hat hatte hatten hier hin hinter ich ihm ihn ihnen ihr ihre
    im in indem ins ist jede jedem jeden jeder jedes jene jetzt kann kein keine können könnte machen man manche mein meine mich mir mit muss
    musste nach nicht nichts noch nun nur ob oder ohne sehr sein seine sich sie sind so solche soll sollte sondern sonst über um und uns unter
    viel vom von vor während war waren warst was weg weil weiter welche wenn werde werden wie wieder will wir wird wirst wo wollen wurde wurden
    zu zum zur zwar zwischen the and for with that this from are was were have has not you your our their which will would can could been
    seite page""".split()
)
_WORD = re.compile(r"[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-]{3,}")


def key_terms(text: str, n: int = 8) -> list[str]:
    counts = Counter(w.lower() for w in _WORD.findall(text) if w.lower() not in STOP)
    return [w for w, _ in counts.most_common(n)]


def extractive_summary(text: str, n: int = 3, max_len: int = 600) -> str:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text)) if 40 <= len(s.strip()) <= 400]
    if not sentences:
        return ""
    freq = Counter(w.lower() for w in _WORD.findall(text) if w.lower() not in STOP)
    scored = sorted(
        enumerate(sentences),
        key=lambda p: -sum(freq[w.lower()] for w in _WORD.findall(p[1]) if w.lower() not in STOP) / (1 + len(p[1]) / 120),
    )
    chosen = sorted(scored[:n])  # ursprüngliche Reihenfolge
    return " ".join(s for _, s in chosen)[:max_len]

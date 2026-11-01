"""TDD für die zentrale Kostenschätzung (BYOK: Kosten aus Token-Verbrauch sichtbar machen)."""

from nexora_worker.llm import ANTHROPIC_MODEL, OPENAI_MODEL, LlmResult, price


def _res(model: str, tin: int, tout: int) -> LlmResult:
    return LlmResult(text="x", provider="p", model=model, input_tokens=tin, output_tokens=tout)


def test_price_openai_mini_matches_published_rate():
    # gpt-4o-mini: 0,15 $ / 1M Eingabe, 0,60 $ / 1M Ausgabe
    assert price(_res(OPENAI_MODEL, 1_000_000, 0)) == 0.15
    assert price(_res(OPENAI_MODEL, 0, 1_000_000)) == 0.60
    assert price(_res(OPENAI_MODEL, 1_000_000, 1_000_000)) == 0.75


def test_price_anthropic_haiku_is_counted():
    # Eingabe und Ausgabe werden getrennt gewichtet; Ausgabe teurer als Eingabe.
    p_in = price(_res(ANTHROPIC_MODEL, 1_000_000, 0))
    p_out = price(_res(ANTHROPIC_MODEL, 0, 1_000_000))
    assert p_in > 0 and p_out > p_in


def test_price_unknown_model_uses_conservative_fallback():
    # Unbekanntes Modell darf nicht 0 kosten (sonst wären Kosten unsichtbar).
    assert price(_res("irgendein-neues-modell", 1_000_000, 0)) > 0


def test_price_zero_tokens_is_zero():
    assert price(_res(OPENAI_MODEL, 0, 0)) == 0.0

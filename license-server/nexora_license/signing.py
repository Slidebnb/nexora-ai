"""Signierte Lizenz-Token (Ed25519): base64url(JSON-Payload) + "." + base64url(Signatur).

Die Desktop-App kennt nur den öffentlichen Schlüssel und kann Token offline prüfen.
"""

from __future__ import annotations

import base64
import json
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64u_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def load_private_key(b64: str) -> Ed25519PrivateKey:
    if not b64:
        raise RuntimeError("LICENSE_SIGNING_KEY fehlt")
    return Ed25519PrivateKey.from_private_bytes(base64.b64decode(b64))


def public_key_pem(key: Ed25519PrivateKey) -> str:
    return key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()


def sign_token(key: Ed25519PrivateKey, payload: dict[str, Any]) -> str:
    body = b64u(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    return f"{body}.{b64u(key.sign(body.encode()))}"


def generate_key_b64() -> str:
    raw = Ed25519PrivateKey.generate().private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    return base64.b64encode(raw).decode()


if __name__ == "__main__":
    k = generate_key_b64()
    print("LICENSE_SIGNING_KEY=" + k)
    print(public_key_pem(load_private_key(k)))

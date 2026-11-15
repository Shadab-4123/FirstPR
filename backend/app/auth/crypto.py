"""Encrypt GitHub tokens before they touch the database.

Fernet = AES-128-CBC + HMAC-SHA256: a stolen database row is useless without the
key, and a tampered ciphertext fails to decrypt instead of yielding garbage.
"""

from cryptography.fernet import Fernet

from app.core.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().token_encryption_key
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not set; refusing to store tokens unencrypted")
    return Fernet(key)


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()

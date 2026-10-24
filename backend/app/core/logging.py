"""
logging.py - Central logging configuration.

- Idempotent: calling setup_logging() repeatedly never duplicates handlers.
- Redacts API keys / bearer tokens from every emitted line (messages and tracebacks).
- Neutralises CR/LF inside messages to prevent log forging; tracebacks keep their layout.
- Quiets HTTP client libraries that can log full request URLs at DEBUG.
"""

from __future__ import annotations

import logging
import re
import sys

from app.core.config import settings

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_HANDLER_MARKER = "_edinno_handler"
_NOISY_LOGGERS = ("urllib3", "httpx", "httpcore", "requests")

_SECRET_PATTERNS = (
    re.compile(r"(?:AIza[0-9A-Za-z_\-]{20,}|AQ\.[0-9A-Za-z_\-]{30,})"),  # Google API keys
    re.compile(r"gsk_[0-9A-Za-z]{20,}"),                                  # Groq
    re.compile(r"sk-or-[0-9A-Za-z_\-]{10,}"),                             # OpenRouter
    re.compile(r"(?i)bearer\s+[0-9A-Za-z._\-]+"),
    re.compile(r"(?i)\b(api[_-]?key|x-goog-api-key|key)(\s*[=:]\s*)[^&\s\"',]+"),
)


def redact(text: str) -> str:
    out = text
    for pattern in _SECRET_PATTERNS[:4]:
        out = pattern.sub("[REDACTED]", out)
    return _SECRET_PATTERNS[4].sub(r"\1\2[REDACTED]", out)


class RedactingFormatter(logging.Formatter):
    """Formats records, then redacts secrets from the final output."""

    def format(self, record: logging.LogRecord) -> str:
        original_msg, original_args = record.msg, record.args
        try:
            message = record.getMessage().replace("\r", "\\r").replace("\n", "\\n")
            record.msg, record.args = message, None
            return redact(super().format(record))
        finally:
            record.msg, record.args = original_msg, original_args


def setup_logging() -> None:
    """Configure the root logger once; safe to call multiple times."""
    level = getattr(logging, str(settings.LOG_LEVEL).upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)

    for handler in root.handlers:
        if getattr(handler, _HANDLER_MARKER, False):
            handler.setLevel(level)
            break
    else:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        handler.setFormatter(RedactingFormatter(LOG_FORMAT))
        setattr(handler, _HANDLER_MARKER, True)
        root.addHandler(handler)

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(max(level, logging.WARNING))


logger = logging.getLogger("edinno.assessment")
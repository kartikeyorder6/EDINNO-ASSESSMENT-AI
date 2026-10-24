"""
config.py - Application settings (pydantic-settings, loaded from environment / .env).

Notes:
- Secret fields stay plain `str` (consumers pass them straight into headers) but are
  excluded from repr(), so printing or logging `settings` never reveals them.
- List fields accept JSON arrays *or* comma/semicolon/newline separated strings,
  so GEMINI_API_KEYS=key1,key2 works in .env as the original comment promised.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Annotated, Any, List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from pathlib import Path

try:                                    # pydantic-settings >= 2.7
    from pydantic_settings import NoDecode
except ImportError:                     # older versions: marker is simply ignored
    NoDecode = object()                 # type: ignore[assignment,misc]

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = str(_BACKEND_DIR / ".env") if (_BACKEND_DIR / ".env").is_file() else ".env"
_LIST_SPLIT_RE = re.compile(r"[\s,;]+")


def _split_unique(raw: str) -> List[str]:
    """Split on whitespace/comma/semicolon, strip quotes, drop empties, keep order, dedupe."""
    parts = (p.strip().strip('"').strip("'") for p in _LIST_SPLIT_RE.split(raw.strip()))
    return list(dict.fromkeys(p for p in parts if p))


def _coerce_list(value: Any) -> Any:
    """Accept JSON array text, delimited text, or an actual list."""
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValueError("Invalid JSON list value.") from exc
            return [str(i).strip() for i in parsed if str(i).strip()]
        return _split_unique(text)
    if isinstance(value, (list, tuple, set)):
        return [str(i).strip() for i in value if str(i).strip()]
    return value


class Settings(BaseSettings):
    PROJECT_NAME: str = "EDINNO AI Assessment Engine"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"

    # CORS
    CORS_ORIGINS: Annotated[List[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    # Local Ollama config
    OLLAMA_URL: str = "http://localhost:11434/api/generate"
    OLLAMA_TAGS_URL: str = "http://localhost:11434/api/tags"
    PRE_ASSEMBLY_MODEL: str = "qwen3.5:2b"
    STANDARD_MODEL: str = "qwen3.5:4b"
    OLLAMA_KEEP_ALIVE: str = "30m"
    OLLAMA_TIMEOUT_SECONDS: int = Field(default=120, gt=0)

    # Google Gemini config (supports 1 to N keys, comma-separated or list)
    GEMINI_API_KEY: Optional[str] = Field(default=None, repr=False)
    GEMINI_API_KEYS: Annotated[List[str], NoDecode] = Field(default_factory=list, repr=False)
    GEMINI_MODEL: str = "gemini-3.6-flash"

    # Groq config
    GROQ_API_KEY: Optional[str] = Field(default=None, repr=False)
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_FALLBACK_MODELS: Annotated[List[str], NoDecode] = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"]

    # OpenRouter config
    OPENROUTER_API_KEY: Optional[str] = Field(default=None, repr=False)
    OPENROUTER_MODEL: str = "recursive/flint-v1.0:free"

    # Limits
    MAX_UPLOAD_SIZE_BYTES: int = Field(default=100 * 1024 * 1024, gt=0)    # 100 MB
    MAX_UPLOAD_FILES: int = Field(default=20, gt=0)
    MAX_TOTAL_UPLOAD_BYTES: int = Field(default=500 * 1024 * 1024, gt=0)
    PDF_MAX_BYTES: int = Field(default=100 * 1024 * 1024, gt=0)            # keep <= upload limit
    PDF_MAX_PAGES: int = Field(default=500, gt=0)
    PRE_ASSEMBLY_CONTEXT_CHARS: int = Field(default=4000, gt=0)
    CHAPTER_CONTEXT_CHARS: int = Field(default=24000, gt=0)
    MASTER_CONTEXT_CHARS: int = Field(default=32000, gt=0)

    # Auth & Verification Controls
    ADMIN_API_TOKEN: Optional[str] = Field(default=None, repr=False)
    ENFORCE_SERVER_SIDE_GRADING: bool = Field(default=False)

    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # -- validators ---------------------------------------------------------

    @field_validator("CORS_ORIGINS", "GEMINI_API_KEYS", "GROQ_FALLBACK_MODELS", mode="before")
    @classmethod
    def _parse_list_fields(cls, value: Any) -> Any:
        return _coerce_list(value)

    @field_validator("GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", mode="before")
    @classmethod
    def _blank_secret_is_none(cls, value: Any) -> Any:
        """An empty `KEY=` line in .env should mean 'not configured'."""
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value

    @field_validator("OLLAMA_URL", "OLLAMA_TAGS_URL")
    @classmethod
    def _http_url_only(cls, value: str) -> str:
        value = value.strip()
        if not value.lower().startswith(("http://", "https://")):
            raise ValueError("Must be an http(s) URL.")
        return value

    @field_validator("LOG_LEVEL")
    @classmethod
    def _normalize_log_level(cls, value: str) -> str:
        level = str(value or "INFO").strip().upper()
        return level if level in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO"

    # -- helpers ------------------------------------------------------------

    def get_gemini_api_keys(self) -> List[str]:
        """
        Deduplicated list of all configured Gemini API keys from GEMINI_API_KEY
        (comma, semicolon or whitespace delimited) and the GEMINI_API_KEYS list.
        """
        keys: dict = {}
        sources = [self.GEMINI_API_KEY or "", *[k for k in self.GEMINI_API_KEYS if isinstance(k, str)]]
        for source in sources:
            for part in _LIST_SPLIT_RE.split(str(source).strip()):
                if part.strip():
                    keys.setdefault(part.strip())
        return list(keys)

    @property
    def gemini_api_keys(self) -> List[str]:
        """Backward-compatible property for callers accessing settings.gemini_api_keys."""
        return self.get_gemini_api_keys()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
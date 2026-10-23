import re
from typing import List, Optional, Union
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "EDINNO AI Assessment Engine"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    
    # CORS
    CORS_ORIGINS: List[str] = [
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
    OLLAMA_TIMEOUT_SECONDS: int = 120

    # Google Gemini config (supports 1 to N keys, comma-separated or list)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_API_KEYS: List[str] = []
    GEMINI_MODEL: str = "gemini-3.6-flash"

    def get_gemini_api_keys(self) -> List[str]:
        """
        Returns a deduplicated list of all configured Gemini API keys
        from GEMINI_API_KEY (comma, semicolon, or newline delimited) and GEMINI_API_KEYS list.
        """
        keys: List[str] = []
        if self.GEMINI_API_KEY:
            for part in re.split(r"[\s,;]+", str(self.GEMINI_API_KEY).strip()):
                k = part.strip()
                if k and k not in keys:
                    keys.append(k)
        if self.GEMINI_API_KEYS:
            for item in self.GEMINI_API_KEYS:
                if isinstance(item, str):
                    for part in re.split(r"[\s,;]+", item.strip()):
                        k = part.strip()
                        if k and k not in keys:
                            keys.append(k)
        return keys

    # Groq config
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FALLBACK_MODELS: List[str] = ["llama-3.1-8b-instant"]

    # OpenRouter config
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_MODEL: str = "recursive/flint-v1.0:free"

    # Limits
    MAX_UPLOAD_SIZE_BYTES: int = 100 * 1024 * 1024  # 100 MB
    PRE_ASSEMBLY_CONTEXT_CHARS: int = 4000
    CHAPTER_CONTEXT_CHARS: int = 24000
    MASTER_CONTEXT_CHARS: int = 32000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()

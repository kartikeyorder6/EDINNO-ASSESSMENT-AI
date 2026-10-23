from typing import List, Optional
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

    # Google Gemini config
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.6-flash"

    # Groq config
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_FALLBACK_MODELS: List[str] = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"]

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

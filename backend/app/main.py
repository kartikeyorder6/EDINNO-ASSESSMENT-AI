"""main.py - FastAPI application entrypoint."""

from __future__ import annotations

import collections
import os
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, Tuple

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.services.ai_generator import HTTP_SESSION
from app.services.gemini_pool import gemini_pool

setup_logging()                       # idempotent; also covers import-time logging

# Preserved from the original deployment. To restrict to your own frontend, set
# CORS_ORIGIN_REGEX, e.g. r"https://my-app(-[a-z0-9-]+)?\.vercel\.app".
DEFAULT_CORS_REGEX = r"https://.*(\.vercel\.app|\.onrender\.com)"
CORS_ORIGIN_REGEX = str(getattr(settings, "CORS_ORIGIN_REGEX", None) or DEFAULT_CORS_REGEX)
_CORS_ORIGIN_RE = re.compile(CORS_ORIGIN_REGEX)

MAX_MULTIPART_BYTES = int(getattr(settings, "MAX_TOTAL_UPLOAD_BYTES", 500 * 1024 * 1024)) + 1024 * 1024
MAX_JSON_BYTES = int(getattr(settings, "MAX_JSON_BODY_BYTES", 25 * 1024 * 1024))
MAX_VALIDATION_ERRORS = 50

SECURITY_HEADERS: Dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}

EXEMPT_RATE_LIMIT_PATHS = {"/", "/health", "/api/health", "/docs", "/redoc", "/openapi.json"}


class SlidingWindowRateLimiter:
    """Thread-safe in-memory sliding window rate limiter with LRU eviction."""

    def __init__(self, limit_per_minute: int = 120, max_tracked_ips: int = 10_000) -> None:
        self.limit = limit_per_minute
        self.window = 60.0
        self.max_ips = max_tracked_ips
        self._records: Dict[str, collections.deque[float]] = {}
        self._lock = threading.Lock()

    def is_allowed(self, client_ip: str) -> Tuple[bool, int]:
        if self.limit <= 0 or not client_ip:
            return True, 0
        now = time.monotonic()
        with self._lock:
            q = self._records.setdefault(client_ip, collections.deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                retry_after = int(max(1, self.window - (now - q[0])))
                return False, retry_after
            q.append(now)
            if len(self._records) > self.max_ips:
                oldest_ip = next(iter(self._records))
                del self._records[oldest_ip]
            return True, 0


rate_limiter = SlidingWindowRateLimiter(
    limit_per_minute=int(getattr(settings, "RATE_LIMIT_PER_MINUTE", 120))
)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def _cors_headers(request: Request) -> Dict[str, str]:
    """Unhandled-error and rate-limit responses bypass CORSMiddleware; add the headers so browsers show the real response."""
    origin = request.headers.get("origin")
    if origin and (origin in settings.CORS_ORIGINS or _CORS_ORIGIN_RE.fullmatch(origin)):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


# =========================================================
# LIFESPAN
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting %s v%s", settings.PROJECT_NAME, settings.VERSION)
    logger.info("Gemini API keys configured: %d", len(gemini_pool.discover_keys()))   # count only
    if not getattr(settings, "ADMIN_API_TOKEN", None):
        logger.warning("ADMIN_API_TOKEN is not set: /system/key-pool is publicly accessible.")
    yield
    logger.info("Shutting down assessment engine.")
    HTTP_SESSION.close()


docs_enabled = bool(getattr(settings, "ENABLE_DOCS", True))

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-performance AI Assessment Engine for STEM, Robotics, and Hardware Curricula.",
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)


# =========================================================
# MIDDLEWARE
# (the last one added is the outermost, so CORS goes last and also covers early 413s)
# =========================================================

@app.middleware("http")
async def http_hardening(request: Request, call_next):
    """Reject oversized bodies up front, enforce sliding-window rate limit, and add security headers."""
    if request.url.path not in EXEMPT_RATE_LIMIT_PATHS and request.method != "OPTIONS":
        allowed, retry_after = rate_limiter.is_allowed(_get_client_ip(request))
        if not allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"success": False, "message": "Too many requests. Please retry in a moment."},
                headers={"Retry-After": str(retry_after), **_cors_headers(request)},
            )

    declared = request.headers.get("content-length", "")
    if declared.isdigit():
        is_multipart = request.headers.get("content-type", "").lower().startswith("multipart/")
        limit = MAX_MULTIPART_BYTES if is_multipart else MAX_JSON_BYTES
        if int(declared) > limit:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"success": False, "message": "Request body too large."},
            )

    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        if name == "Content-Security-Policy" and request.url.path in {"/docs", "/redoc"}:
            continue
        response.headers.setdefault(name, value)
    return response


app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


# =========================================================
# EXCEPTION HANDLERS
# =========================================================


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Keep FastAPI's 422 shape but never echo the submitted input back (it can be huge or sensitive)."""
    errors = [
        {"type": e.get("type"), "loc": e.get("loc"), "msg": e.get("msg")}
        for e in exc.errors()[:MAX_VALIDATION_ERRORS]
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": errors},
        headers=_cors_headers(request),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensure HTTPException responses (400, 403, 404, 413, etc.) carry CORS headers."""
    headers = {**_cors_headers(request), **(exc.headers or {})}
    if isinstance(exc.detail, dict):
        content = exc.detail
    elif isinstance(exc.detail, list):
        content = {"detail": exc.detail}
    else:
        content = {"detail": exc.detail, "success": False, "message": str(exc.detail)}
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=headers,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    ref = uuid.uuid4().hex[:8]
    logger.error(
        "Unhandled %s on %s [ref=%s]", type(exc).__name__, request.url.path, ref, exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": f"Internal server error (ref: {ref})",
            "path": request.url.path,
        },
        headers=_cors_headers(request),
    )


# =========================================================
# ROUTES
# =========================================================

async def health_check():
    """Health check for Render and UptimeRobot pings (GET and HEAD)."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }


for _path in ("/", "/health", "/api/health"):
    app.add_api_route(_path, health_check, methods=["GET", "HEAD"], tags=["System"])

# Versioned routes under /api/v1
app.include_router(api_router, prefix=settings.API_V1_STR)

# Also mounted at the root for backward compatibility with existing clients
# (hidden from the OpenAPI schema to avoid duplicate operations).
app.include_router(api_router, include_in_schema=False)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("RELOAD", "1") == "1",
    )
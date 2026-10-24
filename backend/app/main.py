"""main.py - FastAPI application entrypoint."""

from __future__ import annotations

import os
import re
import uuid
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
}


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
    """Reject oversized bodies up front and add baseline security headers."""
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
        response.headers.setdefault(name, value)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Token"],
)


# =========================================================
# EXCEPTION HANDLERS
# =========================================================

def _cors_headers(request: Request) -> Dict[str, str]:
    """Unhandled-error responses bypass CORSMiddleware; add the headers so browsers show the real error."""
    origin = request.headers.get("origin")
    if origin and (origin in settings.CORS_ORIGINS or _CORS_ORIGIN_RE.fullmatch(origin)):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


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
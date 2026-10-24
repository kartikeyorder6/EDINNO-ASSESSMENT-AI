"""
common.py - Helpers shared by the API routers.

assessment.py can drop its local copies of clean_text, _read_upload_limited and
_http_error and import these instead (names below).
"""

from __future__ import annotations

import re
import uuid
from typing import Any, List, Optional

from fastapi import HTTPException, UploadFile

from app.core.logging import logger

UPLOAD_CHUNK_BYTES = 1024 * 1024
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_WS_RE = re.compile(r"\s+")


def clean_text(value: Any, max_len: int) -> str:
    """Strip control characters, collapse whitespace, clamp length."""
    return _WS_RE.sub(" ", _CONTROL_RE.sub("", str(value or ""))).strip()[:max_len]


def safe_basename(filename: Optional[str], max_len: int = 200) -> str:
    """Drop any directory part (either separator style) and control characters."""
    name = str(filename or "").replace("\\", "/").split("/")[-1]
    return clean_text(name, max_len)


async def read_upload_limited(
    file: UploadFile,
    max_bytes: int,
    name: Optional[str] = None,
) -> bytes:
    """Read an upload in chunks, aborting with 413 as soon as it exceeds the limit."""
    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            limit_mb = max_bytes // (1024 * 1024)
            detail = (
                f"File {name} exceeds maximum allowed size of {limit_mb}MB."
                if name else
                f"Uploaded file exceeds maximum allowed limit of {limit_mb}MB."
            )
            raise HTTPException(status_code=413, detail=detail)
        chunks.append(chunk)
    return b"".join(chunks)


def http_error(
    exc: Exception,
    context: str,
    public_detail: str,
    *,
    value_error_status: int = 400,
    value_error_prefix: str = "",
) -> HTTPException:
    """
    Map an exception to a safe HTTP error. ValueErrors raised by our service layer
    carry user-safe messages; anything else is logged with a reference id and
    reported generically.
    """
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, ValueError):
        return HTTPException(status_code=value_error_status, detail=f"{value_error_prefix}{exc}")
    ref = uuid.uuid4().hex[:8]
    logger.exception("%s failed [ref=%s] (%s)", context, ref, type(exc).__name__)
    return HTTPException(status_code=500, detail=f"{public_detail} (ref: {ref})")
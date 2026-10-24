"""
pdf_reader.py - Safe text extraction from PDF uploads (PyMuPDF).

Hardening:
- size, page-count and extracted-text limits (configurable via settings)
- magic-header and password-protection checks
- generic client-facing errors; internal details go to logs only
- document text is never logged
"""

from __future__ import annotations

from typing import Any, List, Tuple, Union

import pymupdf

from app.core.config import settings
from app.core.logging import logger

PDF_MAGIC = b"%PDF-"
PDF_MAGIC_SCAN_BYTES = 1024                       # the PDF spec allows junk before the header
DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024          # 25 MB
DEFAULT_MAX_PDF_PAGES = 500
MAX_EXTRACTED_CHARS = 5_000_000                   # keep in step with the assessment service limit

BytesLike = Union[bytes, bytearray, memoryview]


def _limit(name: str, default: int) -> int:
    try:
        value = int(getattr(settings, name, default) or default)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def _coerce_bytes(data: Any) -> bytes:
    if isinstance(data, (bytes, bytearray, memoryview)):
        return bytes(data)
    raise ValueError("Expected bytes or file-like object")


def extract_pdf_text_with_meta(pdf_bytes: BytesLike) -> Tuple[str, int]:
    """
    Extract text and page count from raw PDF bytes.

    Returns:
        (combined_text, page_count) where each non-empty page is rendered as
        "Page N\\n<text>" and pages are separated by a blank line.

    Raises:
        ValueError: invalid, oversized, encrypted or unreadable PDF.
    """
    data = _coerce_bytes(pdf_bytes)
    max_bytes = _limit("PDF_MAX_BYTES", DEFAULT_MAX_PDF_BYTES)
    max_pages = _limit("PDF_MAX_PAGES", DEFAULT_MAX_PDF_PAGES)

    if not data:
        raise ValueError("The uploaded PDF is empty.")
    if len(data) > max_bytes:
        raise ValueError(f"PDF exceeds the maximum allowed size of {max_bytes // (1024 * 1024)} MB.")
    if PDF_MAGIC not in data[:PDF_MAGIC_SCAN_BYTES]:
        raise ValueError("The uploaded file is not a valid PDF document.")

    pages: List[str] = []
    total_chars = 0

    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            if doc.needs_pass or doc.is_encrypted:
                raise ValueError("This PDF is password-protected and cannot be read.")

            page_count = doc.page_count
            if page_count > max_pages:
                raise ValueError(f"PDF has too many pages (limit is {max_pages}).")

            for page_number, page in enumerate(doc, start=1):
                text = (page.get_text("text", sort=True) or "").strip()
                if not text:
                    continue
                total_chars += len(text)
                if total_chars > MAX_EXTRACTED_CHARS:
                    raise ValueError("PDF contains more text than can be processed.")
                pages.append(f"Page {page_number}\n{text}")

        return "\n\n".join(pages), page_count

    except ValueError:
        raise                                   # already a safe, user-facing message
    except Exception as error:                  # PyMuPDF raises several unrelated types
        logger.error("PDF extraction error (%s): %s", type(error).__name__, str(error)[:200])
        raise ValueError("Unable to read this PDF document.") from error


def extract_pdf_text(pdf_file: Any) -> str:
    """Backward-compatible extractor accepting bytes or a file-like object."""
    if hasattr(pdf_file, "read"):
        import inspect
        if inspect.iscoroutinefunction(pdf_file.read):
            raise TypeError("Async file object passed to sync extract_pdf_text. Await read() before calling extract_pdf_text.")
        content = pdf_file.read(_limit("PDF_MAX_BYTES", DEFAULT_MAX_PDF_BYTES) + 1)
        if inspect.isawaitable(content):
            raise TypeError("Async read() returned a coroutine. Await read() before calling extract_pdf_text.")
    else:
        content = pdf_file

    text, _ = extract_pdf_text_with_meta(_coerce_bytes(content))
    return text
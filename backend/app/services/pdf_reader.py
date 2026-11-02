"""
pdf_reader.py - Safe text extraction from PDF uploads (PyMuPDF).

Hardening:
- size, page-count and extracted-text limits (configurable via settings)
- magic-header and password-protection checks
- generic client-facing errors; internal details go to logs only
- document text is never logged
"""

from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional, Tuple, Union

import pymupdf

try:
    from PIL import Image as PILImage
except ImportError:
    PILImage = None

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


def extract_pdf_text_with_meta(
    pdf_bytes: BytesLike,
    max_extract_pages: Optional[int] = None,
) -> Tuple[str, int]:
    """
    Extract text and page count from raw PDF bytes.

    Returns:
        (combined_text, page_count) where each non-empty page is rendered as
        "Page N\n<text>" and pages are separated by a blank line.

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
                if max_extract_pages is not None and page_number > max_extract_pages:
                    break
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


def _normalize_image_to_base64(raw_image_bytes: bytes, ext: str, max_dim: int = 600) -> Tuple[str, str]:
    """
    Normalize image bytes to compressed JPEG/PNG and return (data_uri, mime_type).
    """
    clean_ext = (ext or "png").lower().replace(".", "")
    mime = "image/jpeg" if clean_ext in ("jpg", "jpeg") else f"image/{clean_ext}"
    if PILImage is not None:
        try:
            with PILImage.open(io.BytesIO(raw_image_bytes)) as img:
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                    mime = "image/jpeg"
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                    mime = "image/jpeg"

                w, h = img.size
                if max(w, h) > max_dim:
                    scale = max_dim / max(w, h)
                    new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
                    img = img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)

                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85, optimize=True)
                b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                return f"data:image/jpeg;base64,{b64}", "image/jpeg"
        except Exception as err:
            logger.debug("Pillow image normalization fallback: %s", err)

    b64 = base64.b64encode(raw_image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}", mime


def extract_pdf_images(
    pdf_bytes: BytesLike,
    max_images: int = 4,
    min_width: int = 180,
    min_height: int = 180,
) -> List[Dict[str, Any]]:
    """
    Extract component and schematic images from raw PDF bytes.

    Filters out tiny icons, decorative dividers, and header logos based on
    dimensions and aspect ratio.

    Returns:
        List of dicts: {"image_data": "data:...", "mime_type": "...", "caption": "...", "page": N}
    """
    data = _coerce_bytes(pdf_bytes)
    if not data or PDF_MAGIC not in data[:PDF_MAGIC_SCAN_BYTES]:
        return []

    extracted: List[Dict[str, Any]] = []
    seen_xrefs: set = set()

    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            if doc.needs_pass or doc.is_encrypted:
                return []

            for page_number, page in enumerate(doc, start=1):
                if len(extracted) >= max_images:
                    break

                try:
                    image_list = page.get_images(full=True)
                except Exception:
                    continue

                for img_info in image_list:
                    if len(extracted) >= max_images:
                        break
                    xref = img_info[0]
                    if xref in seen_xrefs:
                        continue
                    seen_xrefs.add(xref)

                    try:
                        base_img = doc.extract_image(xref)
                        if not base_img:
                            continue
                        w = base_img.get("width", 0)
                        h = base_img.get("height", 0)
                        raw_bytes = base_img.get("image", b"")
                        ext = base_img.get("ext", "png")

                        if w < min_width or h < min_height:
                            continue

                        ratio = w / max(h, 1)
                        if ratio > 5.0 or ratio < 0.2:
                            continue

                        caption = ""
                        try:
                            rects = page.get_image_rects(xref)
                            if rects:
                                r = rects[0]
                                exp_rect = pymupdf.Rect(
                                    max(0, r.x0 - 20),
                                    max(0, r.y0 - 25),
                                    min(page.rect.width, r.x1 + 20),
                                    min(page.rect.height, r.y1 + 45),
                                )
                                nearby = page.get_text("text", clip=exp_rect).strip()
                                lines = [line.strip() for line in nearby.splitlines() if line.strip()]
                                salient = [
                                    l for l in lines
                                    if any(k in l.lower() for k in (
                                        "fig", "component", "sensor", "module", "circuit",
                                        "pin", "arduino", "board", "diagram", "schematic"
                                    ))
                                ]
                                if salient:
                                    caption = salient[0][:150]
                                elif lines:
                                    caption = lines[0][:150]
                        except Exception:
                            caption = ""

                        data_uri, mime = _normalize_image_to_base64(raw_bytes, ext)
                        extracted.append({
                            "image_data": data_uri,
                            "mime_type": mime,
                            "caption": caption,
                            "page": page_number,
                            "width": w,
                            "height": h,
                        })
                    except Exception as err:
                        logger.debug("Failed extracting image xref %s: %s", xref, err)
                        continue

        return extracted
    except Exception as exc:
        logger.warning("PDF image extraction warning: %s", exc)
        return []
import io
from typing import Tuple, List
import pymupdf
from app.core.logging import logger


def extract_pdf_text_with_meta(pdf_bytes: bytes) -> Tuple[str, int]:
    """
    Extract text and page count from raw PDF bytes using PyMuPDF.

    Returns:
        Tuple[str, int]: (combined_text, page_count)
    """
    extracted_text: List[str] = []
    page_count = 0

    try:
        with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
            page_count = len(doc)
            for page_number, page in enumerate(doc, start=1):
                page_text = page.get_text("text", sort=True)
                if page_text and page_text.strip():
                    extracted_text.append(f"Page {page_number}\n{page_text.strip()}")

        combined = "\n\n".join(extracted_text)
        return combined, page_count

    except Exception as error:
        logger.error(f"PDF extraction error: {error}")
        raise ValueError(f"Unable to read this PDF document: {error}") from error


def extract_pdf_text(pdf_file) -> str:
    """
    Backward-compatible extractor accepting file-like object or bytes.
    """
    if hasattr(pdf_file, "read"):
        content = pdf_file.read()
    elif isinstance(pdf_file, bytes):
        content = pdf_file
    else:
        raise ValueError("Expected bytes or file-like object")

    text, _ = extract_pdf_text_with_meta(content)
    return text

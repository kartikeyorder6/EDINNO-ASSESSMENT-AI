"""export.py - PDF export endpoint."""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Response
from fastapi.concurrency import run_in_threadpool

from app.api.common import clean_text, http_error
from app.schemas.assessment import AssessmentPayload
from app.services.pdf_generator import create_assessment_pdf

router = APIRouter()

DEFAULT_CHAPTER = "STEM Curriculum Assessment"
MAX_CHAPTER_CHARS = 200
MAX_FILENAME_STEM = 80

_FILENAME_UNSAFE_RE = re.compile(r"[^A-Za-z0-9_\-]")
_UNDERSCORES_RE = re.compile(r"_+")

_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
}


def build_download_filename(chapter_name: str) -> str:
    """ASCII-only filename; safe inside a Content-Disposition header."""
    stem = _UNDERSCORES_RE.sub("_", _FILENAME_UNSAFE_RE.sub("_", chapter_name))
    stem = stem[:MAX_FILENAME_STEM].strip("_")
    return f"{stem or 'Curriculum'}_Assessment.pdf"


@router.post("/download-assessment")
async def download_assessment_endpoint(payload: AssessmentPayload):
    """Compile finalized questions into a formatted PDF (ReportLab) and return the bytes."""
    if not payload.questions:
        raise HTTPException(status_code=400, detail="Cannot export PDF without assessment questions.")

    try:
        chapter_name = (
            clean_text(payload.chapter_name or payload.project_name, MAX_CHAPTER_CHARS) or DEFAULT_CHAPTER
        )
        assessment = {
            "assessment_type": payload.assessment_type,
            "chapter_name": chapter_name,
            "questions": [q.model_dump() for q in payload.questions],
        }

        # ReportLab is CPU-bound and synchronous: keep it off the event loop.
        pdf_stream = await run_in_threadpool(create_assessment_pdf, chapter_name, assessment)
        pdf_bytes = pdf_stream.getvalue()

        headers = {
            **_NO_CACHE_HEADERS,
            "Content-Disposition": f'attachment; filename="{build_download_filename(chapter_name)}"',
        }
        return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)

    except Exception as exc:
        raise http_error(exc, "PDF compilation", "PDF generation failed") from exc
import io
import re
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from app.core.logging import logger
from app.schemas.assessment import AssessmentPayload
from app.services.pdf_generator import create_assessment_pdf

router = APIRouter()


@router.post("/download-assessment")
async def download_assessment_endpoint(payload: AssessmentPayload):
    """
    Compile finalized questions into an official formatted PDF via ReportLab.
    Returns binary PDF stream.
    """
    if not payload.questions:
        raise HTTPException(status_code=400, detail="Cannot export PDF without assessment questions.")

    try:
        raw_chapter = payload.chapter_name or payload.project_name or "STEM Curriculum Assessment"
        chapter_name = re.sub(r"\s+", " ", str(raw_chapter)).strip() or "STEM Curriculum Assessment"

        assessment_dict = {
            "assessment_type": payload.assessment_type,
            "chapter_name": chapter_name,
            "questions": [q.model_dump() for q in payload.questions]
        }

        pdf_stream = create_assessment_pdf(chapter_name, assessment_dict)

        safe_filename = re.sub(r"[^A-Za-z0-9_\-]", "_", chapter_name)
        safe_filename = re.sub(r"_+", "_", safe_filename).strip("_")
        filename = f"{safe_filename or 'Curriculum'}_Assessment.pdf"

        return StreamingResponse(
            pdf_stream,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    except Exception as e:
        logger.error(f"PDF compilation error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

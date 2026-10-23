
import os
import glob
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, Form, UploadFile, HTTPException, Query
from app.core.logging import logger
from app.schemas.assessment import (
    GenerateAssessmentRequest,
    GenerateAssessmentResponse,
    PreAssemblyVerifyRequest,
    PreAssemblyVerifyResponse,
    QuizQuestionDetail,
    AssemblyAccessStatusResponse,
    ProjectSummary,
    MergedAssessmentPaperRequest,
)
from app.services.pdf_reader import extract_pdf_text_with_meta
from app.services.ai_generator import (
    generate_assessment,
    detect_project_title,
    generate_merged_assessment,
)

router = APIRouter()

# In-memory store for completed pre-assembly quizzes to enforce backend completion
COMPLETED_PRE_ASSEMBLY: Dict[str, Dict[str, Any]] = {}



def is_answer_correct(user_ans: Optional[str], correct_ans: str, options: Any = None) -> bool:
    if not user_ans:
        return False
    u = str(user_ans).strip()
    c = str(correct_ans).strip()

    if u.upper() == c.upper():
        return True

    # Normalize options dictionary to { "A": "...", "B": "..." }
    opt_map: Dict[str, str] = {}
    if isinstance(options, dict):
        opt_map = {str(k).strip().upper(): str(v).strip() for k, v in options.items()}
    elif isinstance(options, list):
        for idx, val in enumerate(options):
            opt_map[chr(65 + idx)] = str(val).strip()

    u_upper = u.upper()
    c_upper = c.upper()

    # Check key prefix: user "B" vs correct "B) ..."
    if c_upper.startswith(u_upper) and len(u_upper) == 1 and (len(c_upper) == 1 or c_upper[1] in [")", ".", ":", " "]):
        return True
    if u_upper.startswith(c_upper) and len(c_upper) == 1 and (len(u_upper) == 1 or u_upper[1] in [")", ".", ":", " "]):
        return True

    # Check via option map: user key vs correct text, or user text vs correct key
    if opt_map:
        if u_upper in opt_map and opt_map[u_upper].lower() == c.lower():
            return True
        if c_upper in opt_map and opt_map[c_upper].lower() == u.lower():
            return True
        # Exact match between user choice and option text for correct key
        for key, val in opt_map.items():
            if key == c_upper and val.lower() == u.lower():
                return True

    return False



@router.post("/generate-assessment", response_model=GenerateAssessmentResponse)
async def generate_assessment_endpoint(payload: GenerateAssessmentRequest):
    """
    Generate questions from supplied curriculum text using AI.
    """
    if not payload.chapter_content or not payload.chapter_content.strip():
        raise HTTPException(status_code=400, detail="Curriculum content cannot be empty.")

    try:
        result = generate_assessment(
            chapter_content=payload.chapter_content,
            assessment_type=payload.assessment_type,
            question_count=payload.question_count or 5,
            difficulty=payload.difficulty or "medium",
            provider=payload.provider or "auto",
            model=payload.model,
            rejected_questions=payload.rejected_questions,
        )

        return GenerateAssessmentResponse(
            success=True,
            message="Assessment generated successfully.",
            assessment_type=payload.assessment_type,
            chapter_name=result.get("chapter_name", "STEM Assessment"),
            questions=result.get("questions", []),
            metadata={
                "question_count": len(result.get("questions", [])),
                "difficulty": payload.difficulty,
                "provider": result.get("provider_used", "Auto"),
                "model": result.get("model_used", "Standard"),
            }
        )
    except Exception as e:
        logger.error(f"Assessment generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/assessment/merged-paper", response_model=GenerateAssessmentResponse)
async def generate_merged_paper_endpoint(payload: MergedAssessmentPaperRequest):
    """
    Creates a merged assessment question paper covering the curriculum topics,
    strictly enforcing:
    - MUST INCLUDE:
        - Electronic component identification, functions, and applications
        - Number of pins and pin identification of relevant components
        - Hypothetical, scenario-based questions testing practical understanding
        - Logical and conceptual reasoning questions
    - MUST EXCLUDE:
        - Coding questions
        - Circuit-based questions or diagrams
        - Project-related questions, including project-specific pin configurations
    - CONSTRAINTS:
        Balanced topic coverage, zero duplicate questions, appropriate difficulty,
        prioritizing conceptual understanding and practical scenarios.
    """
    if not payload.chapter_content or not payload.chapter_content.strip():
        raise HTTPException(
            status_code=400,
            detail="Curriculum content cannot be empty. Please upload curriculum PDFs to generate assessment."
        )

    try:
        res = generate_merged_assessment(
            chapter_content=payload.chapter_content,
            question_count=payload.question_count or 12,
            difficulty=payload.difficulty or "medium",
            provider=payload.provider or "auto",
            model=payload.model
        )
        return GenerateAssessmentResponse(
            success=True,
            message="Merged assessment question paper generated successfully with all parameters enforced.",
            assessment_type="merged_conceptual",
            chapter_name=res.get("chapter_name", "Merged Curriculum Assessment"),
            questions=res.get("questions", []),
            metadata={
                "question_count": len(res.get("questions", [])),
                "sections_covered": res.get("sections_covered", {}),
                "parameters_enforced": res.get("parameters_enforced", {}),
                "provider": res.get("provider_used", "Auto"),
                "model": res.get("model_used", "Standard"),
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Merged assessment generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate merged assessment: {str(e)}")



@router.post("/generate-pre-assembly", response_model=GenerateAssessmentResponse)
async def generate_pre_assembly_endpoint(
    file: UploadFile = File(...),
    project_title: str = Form(None)
):
    """
    Direct endpoint for Pre-Assembly assessments: uploads single project PDF,
    extracts safety & component requirements, and returns 5 targeted MCQs.
    """
    from app.core.config import settings

    try:
        content = await file.read()
        if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Uploaded file exceeds maximum allowed limit of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB."
            )

        text, _ = extract_pdf_text_with_meta(content)
        title = project_title or detect_project_title(text, filename=file.filename or "")

        result = generate_assessment(
            chapter_content=text,
            assessment_type="pre_assembly",
        )

        return GenerateAssessmentResponse(
            success=True,
            message="Pre-assembly assessment generated successfully.",
            assessment_type="pre_assembly",
            chapter_name=title,
            questions=result.get("questions", []),
            metadata={"question_count": len(result.get("questions", []))}
        )
    except Exception as e:
        logger.error(f"Pre-assembly generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Pre-assembly generation failed: {str(e)}")


@router.get("/pre-assembly/projects", response_model=List[ProjectSummary])
async def list_pre_assembly_projects():
    """
    List user projects verified or completed in the current session.
    """
    summaries = []
    for pid, comp in COMPLETED_PRE_ASSEMBLY.items():
        summaries.append(ProjectSummary(
            id=pid,
            title=comp.get("title", pid),
            filename=comp.get("filename", f"{pid}.pdf"),
            completed=comp.get("passed", False),
            score=comp.get("score"),
        ))
    return summaries


@router.post("/pre-assembly/generate-for-project", response_model=GenerateAssessmentResponse)
async def generate_pre_assembly_for_project(project_id: str = Query(...)):
    """
    Generate 5 pre-assembly component & safety questions for a user-uploaded project.
    """
    raise HTTPException(
        status_code=400,
        detail="Please upload your project PDF directly to generate the pre-assembly safety quiz dynamically."
    )


@router.post("/pre-assembly/verify", response_model=PreAssemblyVerifyResponse)
async def verify_pre_assembly_submission(payload: PreAssemblyVerifyRequest):
    """
    Enforce mandatory quiz completion on backend:
    Grades user answers, calculates score, and issues authorization token if >= 80%.
    """
    total = len(payload.questions)
    if total == 0:
        raise HTTPException(status_code=400, detail="Cannot verify empty quiz.")

    score = 0
    details: List[QuizQuestionDetail] = []

    for idx, q in enumerate(payload.questions):
        qid = str(q.get("id", idx))
        user_choice = payload.answers.get(qid) or payload.answers.get(str(idx))
        correct_ans = str(q.get("answer", ""))
        options = q.get("options")
        correct = is_answer_correct(user_choice, correct_ans, options)

        if correct:
            score += 1

        details.append(QuizQuestionDetail(
            id=qid,
            question=q.get("question", f"Question {idx+1}"),
            user_answer=user_choice,
            correct_answer=correct_ans,
            is_correct=correct,
            explanation=q.get("explanation", ""),
        ))

    pct = round((score / total) * 100.0, 1)
    passed = pct >= 80.0  # Require at least 80% (4 out of 5)

    auth_token = None
    if passed:
        auth_token = f"ASM-AUTH-{uuid.uuid4().hex[:8].upper()}"
        COMPLETED_PRE_ASSEMBLY[payload.project_id.upper()] = {
            "title": payload.project_title,
            "filename": f"{payload.project_id}.pdf",
            "passed": True,
            "score": score,
            "total": total,
            "percentage": pct,
            "token": auth_token,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
        msg = f"Pre-Assembly Quiz Passed ({score}/{total} - {pct}%). Assembly workspace access authorized."
    else:
        COMPLETED_PRE_ASSEMBLY[payload.project_id.upper()] = {
            "title": payload.project_title,
            "filename": f"{payload.project_id}.pdf",
            "passed": False,
            "score": score,
            "total": total,
            "percentage": pct,
            "token": None,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
        msg = f"Pre-Assembly Quiz Score: {score}/{total} ({pct}%). Minimum 80% required to unlock physical assembly. Review components and retry."

    return PreAssemblyVerifyResponse(
        success=True,
        passed=passed,
        score=score,
        total=total,
        percentage=pct,
        passing_threshold=80.0,
        authorization_token=auth_token,
        message=msg,
        project_id=payload.project_id,
        project_title=payload.project_title,
        details=details,
    )


@router.get("/assembly/status", response_model=AssemblyAccessStatusResponse)
async def check_assembly_status(project_id: str = Query(...)):
    """
    Enforce mandatory quiz completion before assembly:
    Blocks access if the pre-assembly quiz has not been completed and passed.
    """
    pid = project_id.upper()
    record = COMPLETED_PRE_ASSEMBLY.get(pid)

    if not record or not record.get("passed"):
        return AssemblyAccessStatusResponse(
            allowed=False,
            project_id=project_id,
            project_title=project_id,
            status="PENDING_QUIZ" if not record else "FAILED_QUIZ",
            score=record.get("score") if record else None,
            total=record.get("total") if record else None,
            authorization_token=None,
            message="Assembly is locked. Mandatory Pre-Assembly Quiz must be completed with at least 80% passing grade first.",
        )

    return AssemblyAccessStatusResponse(
        allowed=True,
        project_id=project_id,
        project_title=project_id,
        status="VERIFIED",
        score=record.get("score"),
        total=record.get("total"),
        authorization_token=record.get("token"),
        message="Assembly clearance verified. User is authorized to proceed to physical assembly.",
    )


@router.get("/chapter/quizzes")
async def get_chapter_quizzes_overview():
    """
    Returns chapter quizzes overview based strictly on user session activity.
    """
    total = len(COMPLETED_PRE_ASSEMBLY)
    completed = sum(1 for c in COMPLETED_PRE_ASSEMBLY.values() if c.get("passed"))
    pct = round((completed / total) * 100, 1) if total > 0 else 0.0

    return {
        "chapter_name": "Curriculum Assessment Suite",
        "modules": [],
        "progress": {
            "total_projects": total,
            "completed_projects": completed,
            "percentage": pct,
        }
    }


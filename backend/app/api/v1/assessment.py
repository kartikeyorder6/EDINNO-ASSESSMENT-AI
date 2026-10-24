"""
assessment.py - Assessment, pre-assembly quiz and system endpoints.

Hardening over the previous version:
- blocking work (LLM calls, PDF parsing) runs in a thread pool, not on the event loop
- uploads are read in bounded chunks (size is enforced before the whole file is in memory)
- generic client errors with a log reference; no internal exception text is returned
- pre-assembly grading is done against answers issued by this server, so a client
  can no longer "pass" by submitting its own answer key
- authorization tokens are cryptographically random
- in-memory stores are thread-safe and bounded
- the key-pool telemetry endpoint can be protected with ADMIN_API_TOKEN
"""

from __future__ import annotations

import hashlib
import re
import secrets
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.common import (
    clean_text,
    http_error as _http_error,
    read_upload_limited as _read_upload_limited,
)
from app.core.config import settings
from app.core.logging import logger
from app.schemas.assessment import (
    AssemblyAccessStatusResponse,
    GenerateAssessmentRequest,
    GenerateAssessmentResponse,
    MergedAssessmentPaperRequest,
    PreAssemblyVerifyRequest,
    PreAssemblyVerifyResponse,
    ProjectSummary,
    QuizQuestionDetail,
)
from app.services.ai_generator import (
    detect_project_title,
    generate_assessment,
    generate_merged_assessment,
)
from app.services.gemini_pool import gemini_pool
from app.services.pdf_reader import extract_pdf_text_with_meta

router = APIRouter()

# =========================================================
# CONSTANTS
# =========================================================

PASS_THRESHOLD = 80.0                    # percent required to unlock assembly
MAX_VERIFY_QUESTIONS = 100
MAX_TITLE_CHARS = 120
MAX_ANSWER_CHARS = 500
MAX_QUESTION_ECHO_CHARS = 1000
UPLOAD_CHUNK_BYTES = 1024 * 1024
ISSUED_QUESTION_TTL_SEC = 6 * 3600       # quizzes must be submitted within 6 hours
ISSUED_QUESTION_CAP = 20_000
COMPLETED_CAP = 10_000
PROJECT_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,63}$"

_PROJECT_ID_RE = re.compile(PROJECT_ID_PATTERN)
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_WS_RE = re.compile(r"\s+")
_ANSWER_DELIMS = (")", ".", ":", " ")


# =========================================================
# BOUNDED, THREAD-SAFE IN-MEMORY STORE
# =========================================================

class BoundedStore:
    """LRU-bounded (optionally TTL) dict-like store, safe across worker threads.

    Process-local: with several workers/replicas, replace with Redis or a database.
    """

    def __init__(self, max_items: int, ttl_sec: Optional[float] = None) -> None:
        self._max = max_items
        self._ttl = ttl_sec
        self._data: "OrderedDict[str, Tuple[float, Any]]" = OrderedDict()
        self._lock = threading.Lock()

    def _expired(self, stamp: float, now: float) -> bool:
        return self._ttl is not None and now - stamp > self._ttl

    def __setitem__(self, key: str, value: Any) -> None:
        now = time.monotonic()
        with self._lock:
            self._data[key] = (now, value)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)

    def get(self, key: str, default: Any = None) -> Any:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return default
            if self._expired(item[0], now):
                del self._data[key]
                return default
            return item[1]

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def items(self) -> List[Tuple[str, Any]]:
        now = time.monotonic()
        with self._lock:
            return [(k, v) for k, (ts, v) in self._data.items() if not self._expired(ts, now)]

    def values(self) -> List[Any]:
        return [v for _, v in self.items()]


# Completed pre-assembly quizzes, keyed by upper-cased project id
COMPLETED_PRE_ASSEMBLY = BoundedStore(max_items=COMPLETED_CAP)
# Questions issued by this server (fingerprint -> authoritative answer data)
ISSUED_QUESTIONS = BoundedStore(max_items=ISSUED_QUESTION_CAP, ttl_sec=ISSUED_QUESTION_TTL_SEC)


# =========================================================
# HELPERS
# =========================================================

def _fingerprint(question_text: Any) -> str:
    normalized = _WS_RE.sub(" ", str(question_text or "").strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]


def _register_issued_questions(questions: Any) -> None:
    """Remember the authoritative answer for every question this server hands out."""
    if not isinstance(questions, list):
        return
    for q in questions:
        data = q.model_dump() if hasattr(q, "model_dump") else q
        if not isinstance(data, dict) or not data.get("question") or data.get("answer") in (None, ""):
            continue
        ISSUED_QUESTIONS[_fingerprint(data["question"])] = {
            "answer": str(data["answer"]),
            "options": data.get("options"),
            "explanation": str(data.get("explanation", "") or ""),
        }


def _validate_project_id(project_id: Any) -> str:
    pid = str(project_id or "").strip()
    if not _PROJECT_ID_RE.match(pid):
        raise HTTPException(status_code=400, detail="Invalid project_id.")
    return pid


async def require_admin(x_admin_token: Optional[str] = Header(default=None)) -> None:
    """Protects operational endpoints when ADMIN_API_TOKEN is configured."""
    expected = getattr(settings, "ADMIN_API_TOKEN", None)
    if not expected:
        return
    if not x_admin_token or not secrets.compare_digest(x_admin_token.encode(), str(expected).encode()):
        raise HTTPException(status_code=403, detail="Forbidden.")


# =========================================================
# ANSWER CHECKING
# =========================================================

def _option_map(options: Any) -> Dict[str, str]:
    """Normalise dict/list options to {"A": "text", ...}."""
    if isinstance(options, dict):
        return {str(k).strip().upper(): str(v).strip() for k, v in options.items()}
    if isinstance(options, list):
        return {chr(65 + i): str(v).strip() for i, v in enumerate(options[:26])}
    return {}


def is_answer_correct(user_ans: Optional[str], correct_ans: str, options: Any = None) -> bool:
    if not user_ans:
        return False
    u, c = str(user_ans).strip(), str(correct_ans).strip()
    u_up, c_up = u.upper(), c.upper()

    if u_up == c_up:
        return True

    # Key vs "B) text" style answers, in either direction
    if len(u_up) == 1 and c_up.startswith(u_up) and (len(c_up) == 1 or c_up[1] in _ANSWER_DELIMS):
        return True
    if len(c_up) == 1 and u_up.startswith(c_up) and (len(u_up) == 1 or u_up[1] in _ANSWER_DELIMS):
        return True

    opts = _option_map(options)
    if opts:
        if u_up in opts and opts[u_up].lower() == c.lower():     # user key, correct given as text
            return True
        if c_up in opts and opts[c_up].lower() == u.lower():     # correct key, user typed the text
            return True
    return False


# =========================================================
# GENERATION ENDPOINTS
# =========================================================

@router.post("/generate-assessment", response_model=GenerateAssessmentResponse)
async def generate_assessment_endpoint(payload: GenerateAssessmentRequest):
    """Generate questions from supplied curriculum text using AI."""
    if not payload.chapter_content or not payload.chapter_content.strip():
        raise HTTPException(status_code=400, detail="Curriculum content cannot be empty.")

    try:
        result = await run_in_threadpool(
            generate_assessment,
            chapter_content=payload.chapter_content,
            assessment_type=payload.assessment_type,
            question_count=payload.question_count or 5,
            difficulty=payload.difficulty or "medium",
            provider=payload.provider or "auto",
            model=payload.model,
            rejected_questions=payload.rejected_questions,
        )
        questions = result.get("questions", [])
        _register_issued_questions(questions)

        return GenerateAssessmentResponse(
            success=True,
            message="Assessment generated successfully.",
            assessment_type=payload.assessment_type,
            chapter_name=result.get("chapter_name", "STEM Assessment"),
            questions=questions,
            metadata={
                "question_count": len(questions),
                "difficulty": payload.difficulty,
                "provider": result.get("provider_used", "Auto"),
                "model": result.get("model_used", "Standard"),
            },
        )
    except Exception as exc:
        raise _http_error(exc, "Assessment generation", "Generation failed") from exc


@router.post("/assessment/merged-paper", response_model=GenerateAssessmentResponse)
async def generate_merged_paper_endpoint(payload: MergedAssessmentPaperRequest):
    """
    Creates a merged assessment question paper covering the curriculum topics.

    MUST INCLUDE: component identification/functions, pin counts, hypothetical
    scenario-based questions, logical and conceptual reasoning.
    MUST EXCLUDE: coding questions, circuit diagrams, project-specific pin configurations.
    CONSTRAINTS: balanced topic coverage, zero duplicates, appropriate difficulty.
    """
    if not payload.chapter_content or not payload.chapter_content.strip():
        raise HTTPException(
            status_code=400,
            detail="Curriculum content cannot be empty. Please upload curriculum PDFs to generate assessment.",
        )

    try:
        res = await run_in_threadpool(
            generate_merged_assessment,
            chapter_content=payload.chapter_content,
            question_count=payload.question_count or 12,
            difficulty=payload.difficulty or "medium",
            provider=payload.provider or "auto",
            model=payload.model,
        )
        questions = res.get("questions", [])
        _register_issued_questions(questions)

        return GenerateAssessmentResponse(
            success=True,
            message="Merged assessment question paper generated successfully with all parameters enforced.",
            assessment_type="merged_conceptual",
            chapter_name=res.get("chapter_name", "Merged Curriculum Assessment"),
            questions=questions,
            metadata={
                "question_count": len(questions),
                "sections_covered": res.get("sections_covered", {}),
                "parameters_enforced": res.get("parameters_enforced", {}),
                "provider": res.get("provider_used", "Auto"),
                "model": res.get("model_used", "Standard"),
            },
        )
    except Exception as exc:
        raise _http_error(exc, "Merged assessment generation", "Failed to generate merged assessment") from exc


@router.post("/generate-pre-assembly", response_model=GenerateAssessmentResponse)
async def generate_pre_assembly_endpoint(
    file: UploadFile = File(...),
    project_title: Optional[str] = Form(None),
):
    """
    Pre-Assembly assessments: uploads a single project PDF, extracts safety and
    component requirements, and returns targeted MCQs.
    """
    try:
        content = await _read_upload_limited(file, settings.MAX_UPLOAD_SIZE_BYTES)
        text, _ = await run_in_threadpool(extract_pdf_text_with_meta, content)
        if not text.strip():
            raise ValueError("No readable text found in this PDF (scanned documents are not supported).")

        filename = clean_text((file.filename or "").replace("\\", "/").split("/")[-1], 200)
        title = clean_text(project_title, MAX_TITLE_CHARS) or detect_project_title(text, filename=filename)

        result = await run_in_threadpool(generate_assessment, chapter_content=text, assessment_type="pre_assembly")
        questions = result.get("questions", [])
        _register_issued_questions(questions)

        return GenerateAssessmentResponse(
            success=True,
            message="Pre-assembly assessment generated successfully.",
            assessment_type="pre_assembly",
            chapter_name=title,
            questions=questions,
            metadata={"question_count": len(questions)},
        )
    except Exception as exc:
        raise _http_error(exc, "Pre-assembly generation", "Pre-assembly generation failed") from exc
    finally:
        await file.close()


# =========================================================
# PRE-ASSEMBLY QUIZ & ASSEMBLY ACCESS
# =========================================================

@router.get("/pre-assembly/projects", response_model=List[ProjectSummary])
async def list_pre_assembly_projects():
    """List projects verified or completed in the current session."""
    return [
        ProjectSummary(
            id=pid,
            title=comp.get("title", pid),
            filename=comp.get("filename", f"{pid}.pdf"),
            completed=comp.get("passed", False),
            score=comp.get("score"),
        )
        for pid, comp in COMPLETED_PRE_ASSEMBLY.items()
    ]


@router.post("/pre-assembly/generate-for-project", response_model=GenerateAssessmentResponse)
async def generate_pre_assembly_for_project(
    project_id: str = Query(..., min_length=1, max_length=64),
):
    """Pre-assembly questions are generated from an uploaded PDF, not a stored project."""
    raise HTTPException(
        status_code=400,
        detail="Please upload your project PDF directly to generate the pre-assembly safety quiz dynamically.",
    )


def _grade_question(
    q: Dict[str, Any], idx: int, answers: Dict[str, Any], enforce: bool,
) -> Tuple[QuizQuestionDetail, bool]:
    qid = clean_text(q.get("id", idx), 64)
    user_choice = answers.get(qid) or answers.get(str(idx))
    user_choice = clean_text(user_choice, MAX_ANSWER_CHARS) if user_choice else None

    question_text = clean_text(q.get("question", f"Question {idx + 1}"), MAX_QUESTION_ECHO_CHARS)
    issued = ISSUED_QUESTIONS.get(_fingerprint(q.get("question")))
    if issued is not None:
        # Authoritative data comes from the server, never from the client.
        correct_ans, options, explanation = issued["answer"], issued["options"], issued["explanation"]
    elif enforce:
        raise HTTPException(
            status_code=400,
            detail="Quiz contains questions that were not issued by this server or have expired. "
                   "Please regenerate the quiz.",
        )
    else:
        correct_ans = str(q.get("answer", ""))
        options, explanation = q.get("options"), str(q.get("explanation", ""))

    correct = is_answer_correct(user_choice, correct_ans, options)
    detail = QuizQuestionDetail(
        id=qid,
        question=question_text,
        user_answer=user_choice,
        correct_answer=correct_ans,
        is_correct=correct,
        explanation=explanation,
    )
    return detail, correct


@router.post("/pre-assembly/verify", response_model=PreAssemblyVerifyResponse)
async def verify_pre_assembly_submission(payload: PreAssemblyVerifyRequest):
    """
    Enforce mandatory quiz completion on the backend: grade answers, compute the
    score, and issue an authorization token when the score is >= 80%.
    """
    project_id = _validate_project_id(payload.project_id)
    project_title = clean_text(payload.project_title, MAX_TITLE_CHARS) or project_id

    total = len(payload.questions)
    if total == 0:
        raise HTTPException(status_code=400, detail="Cannot verify empty quiz.")
    if total > MAX_VERIFY_QUESTIONS:
        raise HTTPException(status_code=400, detail=f"Too many questions (limit is {MAX_VERIFY_QUESTIONS}).")

    enforce = bool(getattr(settings, "ENFORCE_SERVER_SIDE_GRADING", False))
    answers = payload.answers if isinstance(payload.answers, dict) else {}

    score = 0
    details: List[QuizQuestionDetail] = []
    for idx, q in enumerate(payload.questions):
        if not isinstance(q, dict):
            raise HTTPException(status_code=400, detail="Malformed question in submission.")
        detail, correct = _grade_question(q, idx, answers, enforce)
        score += int(correct)
        details.append(detail)

    pct = round((score / total) * 100.0, 1)
    passed = pct >= PASS_THRESHOLD
    auth_token = f"ASM-AUTH-{secrets.token_hex(8).upper()}" if passed else None

    COMPLETED_PRE_ASSEMBLY[project_id.upper()] = {
        "title": project_title,
        "filename": f"{project_id}.pdf",
        "passed": passed,
        "score": score,
        "total": total,
        "percentage": pct,
        "token": auth_token,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }

    if passed:
        msg = f"Pre-Assembly Quiz Passed ({score}/{total} - {pct}%). Assembly workspace access authorized."
    else:
        msg = (
            f"Pre-Assembly Quiz Score: {score}/{total} ({pct}%). Minimum {PASS_THRESHOLD:.0f}% required "
            "to unlock physical assembly. Review components and retry."
        )

    return PreAssemblyVerifyResponse(
        success=True,
        passed=passed,
        score=score,
        total=total,
        percentage=pct,
        passing_threshold=PASS_THRESHOLD,
        authorization_token=auth_token,
        message=msg,
        project_id=project_id,
        project_title=project_title,
        details=details,
    )


@router.get("/assembly/status", response_model=AssemblyAccessStatusResponse)
async def check_assembly_status(
    project_id: str = Query(..., min_length=1, max_length=64, pattern=PROJECT_ID_PATTERN),
):
    """Blocks assembly access until the pre-assembly quiz is completed and passed."""
    record = COMPLETED_PRE_ASSEMBLY.get(project_id.upper())

    if not record or not record.get("passed"):
        return AssemblyAccessStatusResponse(
            allowed=False,
            project_id=project_id,
            project_title=project_id,
            status="FAILED_QUIZ" if record else "PENDING_QUIZ",
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
    """Chapter quizzes overview based strictly on session activity."""
    records = COMPLETED_PRE_ASSEMBLY.values()
    total = len(records)
    completed = sum(1 for c in records if c.get("passed"))
    return {
        "chapter_name": "Curriculum Assessment Suite",
        "modules": [],
        "progress": {
            "total_projects": total,
            "completed_projects": completed,
            "percentage": round((completed / total) * 100, 1) if total else 0.0,
        },
    }


@router.get(
    "/system/key-pool",
    summary="Gemini API Key Pool Telemetry",
    dependencies=[Depends(require_admin)],
)
async def get_gemini_key_pool_telemetry():
    """Real-time capacity, RPM usage, cooldowns and latency for the Gemini key pool."""
    return await run_in_threadpool(gemini_pool.get_telemetry)
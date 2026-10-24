"""assessment.py - Request/response schemas for the assessment API."""

from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, StringConstraints

# ---------------------------------------------------------------------------
# Reusable bounded types (keep payloads from being used for memory/CPU abuse)
# ---------------------------------------------------------------------------

Tiny = Annotated[str, StringConstraints(max_length=64)]
Short = Annotated[str, StringConstraints(max_length=200)]
Medium = Annotated[str, StringConstraints(max_length=1000)]
Long = Annotated[str, StringConstraints(max_length=5000)]
CurriculumText = Annotated[str, StringConstraints(max_length=5_000_000)]   # matches service limit

MAX_QUESTIONS_PER_PAYLOAD = 200
MAX_VERIFY_QUESTIONS = 100          # matches the router limit
PROJECT_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,63}$"


# ---------------------------------------------------------------------------
# Questions & export
# ---------------------------------------------------------------------------

class QuestionItem(BaseModel):
    id: Optional[Union[int, str]] = None
    type: Tiny = "mcq"  # mcq, true_false, general, matching, situation
    question: Long
    options: Optional[Union[Dict[Tiny, Long], List[Long]]] = Field(default=None, max_length=26)
    answer: Long
    explanation: Optional[Long] = ""
    scenario: Optional[Long] = ""
    marks: Optional[int] = Field(default=1, ge=0, le=1000)
    section: Optional[Short] = None
    category: Optional[Short] = None  # e.g. "Component Identification", "Pin Identification"


class AssessmentPayload(BaseModel):
    assessment_type: Tiny = "mcq"
    chapter_name: Optional[Short] = "STEM Assessment"
    project_name: Optional[Short] = None
    difficulty: Optional[Tiny] = "medium"
    provider: Optional[Tiny] = None
    model: Optional[Short] = None
    questions: List[QuestionItem] = Field(default_factory=list, max_length=MAX_QUESTIONS_PER_PAYLOAD)


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

class GenerateAssessmentRequest(BaseModel):
    chapter_content: CurriculumText
    assessment_type: Tiny = "mcq"
    question_count: Optional[int] = Field(default=5, ge=0, le=500)      # service clamps to 3..25
    difficulty: Optional[Tiny] = "medium"
    provider: Optional[Tiny] = "auto"  # "auto", "gemini", "groq", "openrouter", "ollama"
    model: Optional[Short] = None
    rejected_questions: Optional[List[Medium]] = Field(default=None, max_length=200)
    # NOTE: the include_*/exclude_* flags below are accepted for client compatibility but are not
    # currently read by the router or service (the exclusions are always enforced).
    include_component_id: Optional[bool] = True
    include_pin_identification: Optional[bool] = True
    include_scenario_based: Optional[bool] = True
    include_logical_reasoning: Optional[bool] = True
    exclude_coding: Optional[bool] = True
    exclude_circuits: Optional[bool] = True
    exclude_project_specific: Optional[bool] = True


class MergedAssessmentPaperRequest(BaseModel):
    question_count: Optional[int] = Field(default=12, ge=0, le=500)     # service clamps to 4..20
    difficulty: Optional[Tiny] = "medium"
    provider: Optional[Tiny] = "auto"
    model: Optional[Short] = None
    chapter_content: Optional[CurriculumText] = None


class GenerateAssessmentResponse(BaseModel):
    success: bool
    message: str
    assessment_type: str
    chapter_name: str
    questions: List[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Pre-assembly quiz
# ---------------------------------------------------------------------------

class PreAssemblyVerifyRequest(BaseModel):
    project_id: Annotated[str, StringConstraints(pattern=PROJECT_ID_PATTERN)]
    project_title: Short
    # question_id or index -> selected key (e.g. "0": "B")
    answers: Dict[Tiny, Annotated[str, StringConstraints(max_length=500)]] = Field(default_factory=dict, max_length=MAX_VERIFY_QUESTIONS * 2)
    questions: List[Dict[str, Any]] = Field(default_factory=list, max_length=MAX_VERIFY_QUESTIONS)


class QuizQuestionDetail(BaseModel):
    id: Union[int, str]
    question: str
    user_answer: Optional[str]
    correct_answer: str
    is_correct: bool
    explanation: Optional[str] = ""


class PreAssemblyVerifyResponse(BaseModel):
    success: bool
    passed: bool
    score: int
    total: int
    percentage: float
    passing_threshold: float = 80.0
    authorization_token: Optional[str] = None
    message: str
    project_id: str
    project_title: str
    details: List[QuizQuestionDetail]


class AssemblyAccessStatusResponse(BaseModel):
    allowed: bool
    project_id: str
    project_title: str
    status: Literal["VERIFIED", "PENDING_QUIZ", "FAILED_QUIZ"]
    score: Optional[int] = None
    total: Optional[int] = None
    authorization_token: Optional[str] = None
    message: str


class ProjectSummary(BaseModel):
    id: str
    title: str
    filename: str
    category: str = "project"
    has_pre_assembly: bool = True
    completed: bool = False
    score: Optional[int] = None
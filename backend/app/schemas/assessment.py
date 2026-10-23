from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class QuestionItem(BaseModel):
    id: Optional[Union[int, str]] = None
    type: str = "mcq"  # mcq, true_false, general, matching, situation
    question: str
    options: Optional[Union[Dict[str, str], List[str]]] = None
    answer: str
    explanation: Optional[str] = ""
    scenario: Optional[str] = ""
    marks: Optional[int] = 1
    section: Optional[str] = None
    category: Optional[str] = None  # e.g., "Component Identification", "Pin Identification", "Scenario Reasoning", "Logical Reasoning"


class AssessmentPayload(BaseModel):
    assessment_type: str = "mcq"
    chapter_name: Optional[str] = "STEM Assessment"
    project_name: Optional[str] = None
    difficulty: Optional[str] = "medium"
    provider: Optional[str] = None
    model: Optional[str] = None
    questions: List[QuestionItem] = Field(default_factory=list)


class GenerateAssessmentRequest(BaseModel):
    chapter_content: str
    assessment_type: str = "mcq"
    question_count: Optional[int] = 5
    difficulty: Optional[str] = "medium"
    provider: Optional[str] = "auto"  # "auto", "gemini", "groq", "openrouter", "ollama"
    model: Optional[str] = None
    rejected_questions: Optional[List[str]] = None
    include_component_id: Optional[bool] = True
    include_pin_identification: Optional[bool] = True
    include_scenario_based: Optional[bool] = True
    include_logical_reasoning: Optional[bool] = True
    exclude_coding: Optional[bool] = True
    exclude_circuits: Optional[bool] = True
    exclude_project_specific: Optional[bool] = True


class MergedAssessmentPaperRequest(BaseModel):
    question_count: Optional[int] = 12
    difficulty: Optional[str] = "medium"
    provider: Optional[str] = "auto"
    model: Optional[str] = None
    chapter_content: Optional[str] = None


class GenerateAssessmentResponse(BaseModel):
    success: bool
    message: str
    assessment_type: str
    chapter_name: str
    questions: List[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]] = None


class PreAssemblyVerifyRequest(BaseModel):
    project_id: str
    project_title: str
    answers: Dict[str, str]  # question_id or index -> selected_key (e.g. "0": "B")
    questions: List[Dict[str, Any]]


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
    status: str  # "VERIFIED", "PENDING_QUIZ", "FAILED_QUIZ"
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

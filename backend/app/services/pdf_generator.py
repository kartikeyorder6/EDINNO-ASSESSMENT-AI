"""
pdf_generator.py - In-memory PDF rendering of assessments (ReportLab).

Hardening:
- all text is sanitised to Latin-1 AND XML-escaped before reaching Paragraph, so
  model/user text can never inject ReportLab markup (e.g. <img src="file:///...">)
  or crash the layout with stray '<' / '&'
- bounded question count and field lengths
- rendering failures are logged without content and surfaced as a generic error
"""

from __future__ import annotations

import io
import re
import unicodedata
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.logging import logger

# =========================================================
# CONSTANTS
# =========================================================

MAX_QUESTIONS = 200
MAX_FIELD_CHARS = 5000
MAX_OPTIONS = 26
DEFAULT_TITLE = "Curriculum Assessment"
AUTHOR = "EDINNO AI Assessment Engine"

PAGE_MARGIN_X = 18 * mm
PAGE_MARGIN_Y = 16 * mm
CONTENT_WIDTH = A4[0] - 2 * PAGE_MARGIN_X          # 174 mm
KEY_COL_WIDTHS = [14 * mm, 42 * mm, CONTENT_WIDTH - 56 * mm]

INK = "#0F172A"
SLATE = "#334155"
MUTED = "#64748B"


class PdfGenerationError(RuntimeError):
    """Raised when the PDF cannot be rendered (not caused by invalid input)."""


# =========================================================
# TEXT SANITISATION
# =========================================================

UNICODE_REPLACEMENTS = {
    # Dashes and hyphens (fixes "real■time" tofu block)
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-",
    "\u2014": " - ", "\u2015": " - ", "\u2212": "-", "\u00ad": "",
    # Quotes
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
    "\u00ab": '"', "\u00bb": '"',
    # Spaces and zero-width characters
    "\u00a0": " ", "\u2000": " ", "\u2001": " ", "\u2002": " ", "\u2003": " ",
    "\u2004": " ", "\u2005": " ", "\u2006": " ", "\u2007": " ", "\u2008": " ",
    "\u2009": " ", "\u200a": " ", "\u200b": "", "\u200c": "", "\u200d": "",
    "\u202f": " ", "\u205f": " ", "\u3000": " ", "\ufeff": "",
    # Bullets, math and squares (fixes black square glyphs)
    "\u2022": "*", "\u2023": "*", "\u2043": "-",
    "\u25a0": "", "\u25aa": "", "\u25fe": "", "\u25fc": "", "\u25ab": "", "\u25ac": "",
    "\u25cf": "*", "\u25cb": "*", "\u2026": "...", "\u00b1": "+/-",
    "\u03bc": "u", "\u00b5": "u", "\u03a9": " Ohm", "\u2126": " Ohm", "\u00b0": " deg",
    "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2192": "->", "\u2190": "<-",
}

_TRANSLATE_TABLE = {ord(k): v for k, v in UNICODE_REPLACEMENTS.items()}
_SQUARES_RE = re.compile(r"[\u25a0-\u25ff\u2b00-\u2bff]")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
_QUESTION_PREFIX_RE = re.compile(r"^\s*(?:q(?:uestion)?\s*)?\d+\s*[\.\)\:\-]\s*", re.IGNORECASE)
_BRACKET_RE = re.compile(r"\s*[\(\[].*?[\)\]]", re.DOTALL)
_CHAPTER_PREFIX_RE = re.compile(r"^chapter\s*(name)?\s*[:\-]\s*", re.IGNORECASE)


def sanitize_text_for_pdf(val: Any) -> str:
    """
    Reduce text to Latin-1 (safe for the built-in Type 1 fonts), removing unmapped
    glyphs that would render as black squares, plus control characters that are
    illegal in ReportLab's XML paragraphs. Output is PLAIN text: escape before rendering.
    """
    if val is None:
        return ""
    s = str(val)[:MAX_FIELD_CHARS].translate(_TRANSLATE_TABLE)
    s = _SQUARES_RE.sub("", s)
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("latin-1", "ignore").decode("latin-1")
    return _CONTROL_RE.sub("", s)


def _esc(text: str) -> str:
    """Escape plain text for use inside a Paragraph."""
    return xml_escape(text)


def clean_question_text(text: Any) -> str:
    return _QUESTION_PREFIX_RE.sub("", sanitize_text_for_pdf(text)).strip()


def clean_option_text(prefix: str, text: Any) -> str:
    pattern = rf"^\s*{re.escape(str(prefix))}\s*[\.\)\:\-]\s*"
    return re.sub(pattern, "", sanitize_text_for_pdf(text), flags=re.IGNORECASE).strip()


def _strip_brackets(text: str) -> str:
    stripped = _BRACKET_RE.sub("", text).strip()
    if not stripped or len(stripped) < 3 or stripped.lower().startswith(("activity", "project", "chapter", "topic", "page")):
        inner_matches = re.findall(r"[\(\[](.*?)[\)\]]", text)
        for inner in inner_matches:
            inner_clean = inner.strip()
            if len(inner_clean) >= 3 and not inner_clean.lower().startswith(("activity", "project", "chapter", "topic", "page")):
                return inner_clean
    return stripped or text


# =========================================================
# QUESTION HELPERS
# =========================================================

def get_answer(item: Dict[str, Any]) -> str:
    ans = item.get("answer") or item.get("correct_answer") or item.get("correct_option") or ""
    return sanitize_text_for_pdf(ans).strip()


def get_question_type(item: Dict[str, Any], fallback: str = "mcq") -> str:
    t = str(item.get("type", "")).strip().lower()
    if t in {"mcq", "multiple_choice"}:
        return "mcq"
    if t in {"true_false", "true/false", "tf"}:
        return "true_false"
    if t in {"general", "short_answer", "short"}:
        return "general"
    if t in {"matching", "match"}:
        return "matching"
    if t in {"situation", "scenario"}:
        return "situation"

    if item.get("options"):
        return "mcq"
    if "pairs" in item or "match_pairs" in item:
        return "matching"
    if item.get("scenario"):
        return "situation"
    return fallback


def _option_pairs(options: Any) -> List[Tuple[str, str]]:
    """Normalise dict/list options to [(UPPER_KEY, cleaned_text)]."""
    if isinstance(options, dict):
        items = [(str(k).strip().upper(), v) for k, v in options.items()]
    elif isinstance(options, (list, tuple)):
        items = [(chr(65 + i), v) for i, v in enumerate(options)]
    else:
        return []
    return [(k, clean_option_text(k, v)) for k, v in items[:MAX_OPTIONS]]


def _format_answer(ans: str, q_type: str, option_pairs: List[Tuple[str, str]]) -> str:
    upper = ans.upper().strip()
    if q_type == "true_false" or ans.strip().lower() in {"true", "false"}:
        if upper in {"A", "TRUE"}:
            return "(A) True"
        if upper in {"B", "FALSE"}:
            return "(B) False"
    option_map = dict(option_pairs)
    if upper in option_map:
        return f"({upper}) {option_map[upper]}"
    return ans or "Verified"


def _coerce_questions(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list) or not raw:
        raise ValueError("No assessment questions provided.")
    if len(raw) > MAX_QUESTIONS:
        raise ValueError(f"Too many questions (limit is {MAX_QUESTIONS}).")

    questions: List[Dict[str, Any]] = []
    for q in raw:
        if hasattr(q, "model_dump"):
            questions.append(q.model_dump())
        elif isinstance(q, dict):
            questions.append(q)
    if not questions:
        raise ValueError("No assessment questions provided.")
    return questions


# =========================================================
# STYLES (built once)
# =========================================================

@lru_cache(maxsize=1)
def _styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()

    def make(name: str, parent: str = "Normal", **kw: Any) -> ParagraphStyle:
        return ParagraphStyle(f"EDINNO{name}", parent=base[parent], **kw)

    return {
        "title": make("Title", "Title", fontName="Times-Bold", fontSize=18, leading=22,
                      alignment=TA_CENTER, textColor=colors.HexColor(INK), spaceAfter=4),
        "meta": make("MetaSubtitle", fontName="Times-Roman", fontSize=10, leading=14,
                     alignment=TA_CENTER, textColor=colors.HexColor(MUTED), spaceAfter=8),
        "question": make("Question", fontName="Times-Bold", fontSize=10.5, leading=15,
                         textColor=colors.HexColor(INK), spaceAfter=4),
        "scenario": make("Scenario", fontName="Times-Italic", fontSize=9.5, leading=13.5,
                         textColor=colors.HexColor(SLATE), spaceAfter=4),
        "option": make("Option", fontName="Times-Roman", fontSize=10, leading=14,
                       leftIndent=5 * mm, textColor=colors.HexColor("#1E293B"), spaceAfter=3),
        "body": make("Body", fontName="Times-Roman", fontSize=9.5, leading=13.5,
                     textColor=colors.HexColor(SLATE), spaceAfter=4),
        "answer": make("Answer", fontName="Times-Bold", fontSize=9.5, leading=13,
                       textColor=colors.HexColor("#15803D")),
        "table_header": make("TableHeader", fontName="Times-Bold", fontSize=9.5, leading=13,
                             textColor=colors.HexColor(INK)),
    }


_KEY_TABLE_STYLE = TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
    ("LINEBELOW", (0, 0), (-1, 0), 1.2, colors.HexColor(INK)),
    ("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.HexColor("#CBD5E1")),
    ("TOPPADDING", (0, 0), (-1, 0), 6),
    ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBF9F5")]),
    ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
    ("TOPPADDING", (0, 1), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
])


# =========================================================
# PDF BUILDER
# =========================================================

def create_assessment_pdf(chapter_name: str, assessment: Dict[str, Any]) -> io.BytesIO:
    """
    Render a clean, minimal assessment PDF in memory:
    - header with the chapter name (no student box or boilerplate)
    - questions with options, scenarios and answer lines
    - answer key and grading rubric appendix
    All text is sanitised against tofu glyphs and escaped against markup injection.
    """
    if not isinstance(assessment, dict):
        raise ValueError("Invalid assessment data format.")
    questions = _coerce_questions(assessment.get("questions"))

    clean_chapter = _strip_brackets(
        sanitize_text_for_pdf(chapter_name or DEFAULT_TITLE).strip()
    ) or DEFAULT_TITLE

    heading_name = _strip_brackets(_CHAPTER_PREFIX_RE.sub("", clean_chapter).strip()) or DEFAULT_TITLE

    st = _styles()
    story: List[Any] = [
        Paragraph(f"<b>{_esc('Chapter Name: ' + heading_name)}</b>", st["title"]),
        Paragraph(f"Curriculum Assessment Examination  -  Total Questions: {len(questions)}", st["meta"]),
        Spacer(1, 2 * mm),
    ]

    divider = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[1])
    divider.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 1, colors.HexColor(INK))]))
    story += [divider, Spacer(1, 6 * mm)]

    key_rows: List[List[Any]] = [[
        Paragraph("<b>Q#</b>", st["table_header"]),
        Paragraph("<b>Correct Answer</b>", st["table_header"]),
        Paragraph("<b>Pedagogical Rationale &amp; Grading Rubric</b>", st["table_header"]),
    ]]

    for i, item in enumerate(questions, start=1):
        q_type = get_question_type(item, fallback="mcq")
        option_pairs = _option_pairs(item.get("options"))
        block: List[Any] = []

        scenario = sanitize_text_for_pdf(item.get("scenario", "")).strip()
        if scenario:
            block.append(Paragraph(f"<b>[Scenario]:</b> {_esc(scenario)}", st["scenario"]))

        block.append(Paragraph(f"<b>Q{i}.</b> {_esc(clean_question_text(item.get('question', '')))}", st["question"]))

        if option_pairs:
            for key, text in option_pairs:
                block.append(Paragraph(f"<b>({_esc(key)})</b> {_esc(text)}", st["option"]))
        elif q_type == "true_false":
            block.append(Paragraph("<b>(A)</b> True", st["option"]))
            block.append(Paragraph("<b>(B)</b> False", st["option"]))

        if q_type in {"general", "situation"} and not option_pairs:
            block.append(Spacer(1, 2 * mm))
            block.append(Paragraph(
                "<i>Answer / Analysis: __________________________________________________________________________</i>",
                st["body"],
            ))

        block.append(Spacer(1, 4 * mm))
        story.append(KeepTogether(block))

        ans_display = _format_answer(get_answer(item), q_type, option_pairs)
        rationale = (
            sanitize_text_for_pdf(item.get("explanation", "")).strip()
            or "Derived directly from curriculum procedural documentation."
        )
        key_rows.append([
            Paragraph(f"<b>Q{i}</b>", st["body"]),
            Paragraph(f"<b>{_esc(ans_display)}</b>", st["answer"]),
            Paragraph(_esc(rationale), st["body"]),
        ])

    # Appendix: answer key & rubric
    story += [
        PageBreak(),
        Paragraph("<b>Answer Key &amp; Evaluation Rubric</b>", st["title"]),
        Paragraph(f"Curriculum: {_esc(clean_chapter)}  -  Official Instructor Solution Guide", st["meta"]),
        Spacer(1, 3 * mm),
    ]
    key_table = Table(key_rows, colWidths=KEY_COL_WIDTHS, repeatRows=1)
    key_table.setStyle(_KEY_TABLE_STYLE)
    story.append(key_table)

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=PAGE_MARGIN_X,
        leftMargin=PAGE_MARGIN_X,
        topMargin=PAGE_MARGIN_Y,
        bottomMargin=PAGE_MARGIN_Y,
        title=clean_chapter,
        author=AUTHOR,
    )
    try:
        doc.build(story)
    except Exception as exc:                     # layout/font errors; never log document content
        logger.error("Assessment PDF rendering failed (%s).", type(exc).__name__)
        raise PdfGenerationError("Failed to render the assessment PDF.") from exc

    output.seek(0)
    return output
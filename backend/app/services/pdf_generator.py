import io
import re
import unicodedata
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)

from app.core.logging import logger

UNICODE_REPLACEMENTS = {
    # Dashes and hyphens (fixes "real■time" tofu block)
    "\u2010": "-",
    "\u2011": "-",  # non-breaking hyphen
    "\u2012": "-",
    "\u2013": "-",  # en dash
    "\u2014": " - ", # em dash
    "\u2015": " - ",
    "\u2212": "-",  # minus sign
    "\u00ad": "",   # soft hyphen

    # Quotes
    "\u2018": "'",
    "\u2019": "'",
    "\u201a": "'",
    "\u201b": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u201e": '"',
    "\u201f": '"',
    "\u00ab": '"',
    "\u00bb": '"',

    # Spaces and non-printable zero-width chars
    "\u00a0": " ",
    "\u2000": " ",
    "\u2001": " ",
    "\u2002": " ",
    "\u2003": " ",
    "\u2004": " ",
    "\u2005": " ",
    "\u2006": " ",
    "\u2007": " ",
    "\u2008": " ",
    "\u2009": " ",
    "\u200a": " ",
    "\u200b": "",
    "\u200c": "",
    "\u200d": "",
    "\u202f": " ",
    "\u205f": " ",
    "\u3000": " ",
    "\ufeff": "",

    # Bullets, math and squares (fixes black square glyphs)
    "\u2022": "*",
    "\u2023": "*",
    "\u2043": "-",
    "\u25a0": "",
    "\u25aa": "",
    "\u25fe": "",
    "\u25fc": "",
    "\u25ab": "",
    "\u25ac": "",
    "\u25cf": "*",
    "\u25cb": "*",
    "\u2026": "...",
    "\u00b1": "+/-",
    "\u03bc": "u",
    "\u00b5": "u",
    "\u03a9": " Ohm",
    "\u2126": " Ohm",
    "\u00b0": " deg",
    "\u2264": "<=",
    "\u2265": ">=",
    "\u2260": "!=",
    "\u2192": "->",
    "\u2190": "<-",
}


def sanitize_text_for_pdf(val: Any) -> str:
    """
    Sanitize text to guarantee standard Latin-1/Helvetica/Times font compatibility
    and permanently remove any black dots/squares (tofu glyphs) caused by unmapped Unicode.
    """
    if val is None:
        return ""
    s = str(val)
    for k, v in UNICODE_REPLACEMENTS.items():
        if k in s:
            s = s.replace(k, v)
    # Strip any remaining Unicode square symbols
    s = re.sub(r"[\u25a0-\u25ff\u2b00-\u2bff]", "", s)
    s = unicodedata.normalize("NFKD", s)
    return s.encode("latin-1", "ignore").decode("latin-1")


def clean_question_text(text: Any) -> str:
    cleaned = sanitize_text_for_pdf(text)
    return re.sub(
        r"^\s*(?:q(?:uestion)?\s*)?\d+\s*[\.\)\:\-]\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()


def clean_option_text(prefix: str, text: Any) -> str:
    cleaned = sanitize_text_for_pdf(text)
    pattern = rf"^\s*{re.escape(prefix)}\s*[\.\)\:\-]\s*"
    return re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()


def get_answer(item: Dict[str, Any]) -> str:
    ans = (
        item.get("answer")
        or item.get("correct_answer")
        or item.get("correct_option")
        or ""
    )
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

    if "options" in item and item["options"]:
        return "mcq"
    if "pairs" in item or "match_pairs" in item:
        return "matching"
    if "scenario" in item and item["scenario"]:
        return "situation"
    return fallback


def create_assessment_pdf(chapter_name: str, assessment: Dict[str, Any]) -> io.BytesIO:
    """
    Generate clean, minimal assessment PDF document in memory using ReportLab.
    - Top header: Prominently displays the chapter name with no clutter (no student fill-in table or boilerplate instructions).
    - All text is sanitized against Unicode to prevent black square (tofu) glyphs.
    - Minimalist, modern Answer Key & Grading Rubric appendix.
    """
    if not isinstance(assessment, dict):
        raise ValueError("Invalid assessment data format.")

    raw_questions = assessment.get("questions")
    if not isinstance(raw_questions, list) or not raw_questions:
        raise ValueError("No assessment questions provided.")

    questions: List[Dict[str, Any]] = []
    for q in raw_questions:
        if hasattr(q, "model_dump"):
            questions.append(q.model_dump())
        elif isinstance(q, dict):
            questions.append(q)

    clean_chapter = sanitize_text_for_pdf(chapter_name or "Curriculum Assessment").strip()
    clean_chapter_no_brackets = re.sub(r"\s*[\(\[].*?[\)\]]", "", clean_chapter, flags=re.DOTALL).strip()
    if clean_chapter_no_brackets:
        clean_chapter = clean_chapter_no_brackets
    if not clean_chapter:
        clean_chapter = "Curriculum Assessment"

    output = io.BytesIO()

    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=clean_chapter,
        author="EDINNO AI Assessment Engine",
    )

    styles = getSampleStyleSheet()

    # Clean, modern typography using standard Type 1 fonts
    title_style = ParagraphStyle(
        "EDINNOTitle",
        parent=styles["Title"],
        fontName="Times-Bold",
        fontSize=18,
        leading=22,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=4,
    )

    meta_subtitle_style = ParagraphStyle(
        "EDINNOMetaSubtitle",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10,
        leading=14,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=8,
    )

    question_style = ParagraphStyle(
        "EDINNOQuestion",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=4,
    )

    scenario_style = ParagraphStyle(
        "EDINNOScenario",
        parent=styles["Normal"],
        fontName="Times-Italic",
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=4,
    )

    option_style = ParagraphStyle(
        "EDINNOOption",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10,
        leading=14,
        leftIndent=5 * mm,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=3,
    )

    body_style = ParagraphStyle(
        "EDINNOBody",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=4,
    )

    answer_style = ParagraphStyle(
        "EDINNOAnswer",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#15803D"),
    )

    table_header_style = ParagraphStyle(
        "EDINNOTableHeader",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#0F172A"),
    )

    story = []

    # =========================================================
    # 1. TOP HEADER: CHAPTER NAME (NO STUDENT BOX / NO BOILERPLATE INSTRUCTIONS)
    # =========================================================
    clean_raw = re.sub(r"^chapter\s*(name)?\s*[:\-]\s*", "", clean_chapter, flags=re.IGNORECASE).strip()
    # Strip bracketed subtitle sections such as (Emergency Braking System) or [Sub-Section]
    clean_no_brackets = re.sub(r"\s*[\(\[].*?[\)\]]", "", clean_raw, flags=re.DOTALL).strip()
    if clean_no_brackets:
        clean_raw = clean_no_brackets
    if not clean_raw:
        clean_raw = "Curriculum Assessment"
    heading_title = f"Chapter Name: {clean_raw}"

    story.append(Paragraph(f"<b>{heading_title}</b>", title_style))
    story.append(
        Paragraph(
            f"Curriculum Assessment Examination  -  Total Questions: {len(questions)}",
            meta_subtitle_style,
        )
    )
    story.append(Spacer(1, 2 * mm))

    # Clean subtle horizontal divider rule
    divider = Table([[""]], colWidths=[174 * mm], rowHeights=[1])
    divider.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, -1), 1, colors.HexColor("#0F172A")),
            ]
        )
    )
    story.append(divider)
    story.append(Spacer(1, 6 * mm))

    # =========================================================
    # 2. QUESTIONS SECTION
    # =========================================================
    answer_key_rows = [
        [
            Paragraph("<b>Q#</b>", table_header_style),
            Paragraph("<b>Correct Answer</b>", table_header_style),
            Paragraph("<b>Pedagogical Rationale & Grading Rubric</b>", table_header_style),
        ]
    ]

    for i, item in enumerate(questions, start=1):
        q_elements = []
        q_text = clean_question_text(item.get("question", ""))
        q_type = get_question_type(item, fallback="mcq")

        # Scenario / Context if present
        scenario_text = sanitize_text_for_pdf(item.get("scenario", "")).strip()
        if scenario_text:
            q_elements.append(
                Paragraph(f"<b>[Scenario]:</b> {scenario_text}", scenario_style)
            )

        # Question title & text
        q_elements.append(Paragraph(f"<b>Q{i}.</b> {q_text}", question_style))

        # Options for MCQs and True/False
        options = item.get("options")
        if options and isinstance(options, dict):
            for opt_key, opt_val in options.items():
                cleaned_opt = clean_option_text(opt_key, opt_val)
                q_elements.append(
                    Paragraph(f"<b>({opt_key.upper()})</b> {cleaned_opt}", option_style)
                )
        elif options and isinstance(options, list):
            for idx_opt, opt_val in enumerate(options):
                opt_key = chr(65 + idx_opt)
                cleaned_opt = clean_option_text(opt_key, opt_val)
                q_elements.append(
                    Paragraph(f"<b>({opt_key})</b> {cleaned_opt}", option_style)
                )
        elif q_type == "true_false":
            q_elements.append(Paragraph("<b>(A)</b> True", option_style))
            q_elements.append(Paragraph("<b>(B)</b> False", option_style))

        # Space for answer writing if open-ended
        if q_type in {"general", "situation"} and not options:
            q_elements.append(Spacer(1, 2 * mm))
            q_elements.append(
                Paragraph(
                    "<i>Answer / Analysis: __________________________________________________________________________</i>",
                    body_style,
                )
            )

        q_elements.append(Spacer(1, 4 * mm))
        story.append(KeepTogether(q_elements))

        # Answer Key Data
        ans = get_answer(item)
        if q_type == "true_false" and ans.upper() in {"A", "B"}:
            ans_display = f"{ans.upper()} (True)" if ans.upper() == "A" else f"{ans.upper()} (False)"
        elif options and isinstance(options, dict) and ans.upper() in options:
            opt_val_clean = clean_option_text(ans.upper(), options[ans.upper()])
            ans_display = f"({ans.upper()}) {opt_val_clean}"
        else:
            ans_display = ans or "Verified"

        expl = sanitize_text_for_pdf(item.get("explanation", "")).strip()
        if not expl:
            expl = "Derived directly from curriculum procedural documentation."

        answer_key_rows.append(
            [
                Paragraph(f"<b>Q{i}</b>", body_style),
                Paragraph(f"<b>{ans_display}</b>", answer_style),
                Paragraph(expl, body_style),
            ]
        )

    # =========================================================
    # 3. APPENDIX: ASSESSMENT ANSWER KEY & RUBRIC (SIMPLE & MINIMAL)
    # =========================================================
    story.append(PageBreak())
    story.append(Paragraph("<b>Answer Key & Evaluation Rubric</b>", title_style))
    story.append(
        Paragraph(
            f"Curriculum: {clean_chapter}  -  Official Instructor Solution Guide",
            meta_subtitle_style,
        )
    )
    story.append(Spacer(1, 3 * mm))

    # Sleek 3-column table filling exactly 174mm printable width
    key_table = Table(
        answer_key_rows,
        colWidths=[14 * mm, 42 * mm, 118 * mm],
        repeatRows=1,
    )
    key_table.setStyle(
        TableStyle(
            [
                # Minimalist header
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
                ("LINEBELOW", (0, 0), (-1, 0), 1.2, colors.HexColor("#0F172A")),
                ("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.HexColor("#CBD5E1")),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                # Clean alternating rows and light dividers
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBF9F5")]),
                ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("TOPPADDING", (0, 1), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(key_table)

    doc.build(story)
    output.seek(0)
    return output

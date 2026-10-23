import io
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import (
    ParagraphStyle,
    getSampleStyleSheet
)
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether
)


# =========================================================
# HELPERS
# =========================================================

def clean_question_text(text):
    """
    Remove leading numbering such as:
    1.
    2)
    Q1.
    Question 1:
    """

    text = str(
        text or ""
    ).strip()

    text = re.sub(
        r"^\s*(?:q(?:uestion)?\s*)?\d+\s*[\.\)\:\-]\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    return text.strip()


def clean_option_text(
    option,
    index
):
    """
    Normalize MCQ option labels.
    """

    text = str(
        option or ""
    ).strip()

    text = re.sub(
        r"^\s*[a-dA-D]\s*[\.\)\:\-]\s*",
        "",
        text
    )

    labels = [
        "a",
        "b",
        "c",
        "d"
    ]

    label = (
        labels[index]
        if index < len(labels)
        else str(index + 1)
    )

    return (
        f"{label}) {text}"
    )


def get_answer(item):
    """
    Read answer consistently.
    """

    return str(
        item.get(
            "answer",
            item.get(
                "correct_answer",
                ""
            )
        )
    ).strip()


def get_question_type(
    item,
    index=0,
    assessment_type=""
):
    """
    Normalize question type.
    """

    question_type = str(
        item.get(
            "question_type",
            item.get(
                "type",
                ""
            )
        )
    ).strip().lower()

    question_type = question_type.replace(
        "-",
        "_"
    ).replace(
        " ",
        "_"
    )

    aliases = {
        "multiple_choice": "mcq",
        "multiple_choice_question": "mcq",
        "truefalse": "true_false",
        "true_or_false": "true_false",
        "tf": "true_false",
        "situation": "situation_based",
        "scenario": "situation_based",
        "scenario_based": "situation_based",
        "short_answer": "general",
        "general_question": "general",
        "match": "matching",
    }

    question_type = aliases.get(
        question_type,
        question_type
    )

    if question_type:
        return question_type

    options = item.get(
        "options"
    )

    if (
        isinstance(options, list)
        and
        len(options) == 4
    ):
        return "mcq"

    answer = get_answer(
        item
    ).lower()

    if answer in {
        "true",
        "false"
    }:
        return "true_false"

    if (
        item.get("scenario")
        or
        item.get("situation")
    ):
        return "situation_based"

    assessment_type = str(
        assessment_type or ""
    ).strip().lower()

    if assessment_type in {
        "pre_assembly",
        "mcq"
    }:
        return "mcq"

    if assessment_type == "true_false":
        return "true_false"

    if assessment_type == "general":
        return "general"

    if assessment_type == "matching":
        return "matching"

    if assessment_type == "mixed":
        return (
            "mcq"
            if index < 5
            else "true_false"
        )

    if assessment_type == "master_mcq_tf":
        return (
            "mcq"
            if index < 5
            else "true_false"
        )

    if assessment_type == "master_mcq_situation":
        return (
            "mcq"
            if index < 5
            else "situation_based"
        )

    if assessment_type == "master_tf_situation":
        return (
            "true_false"
            if index < 5
            else "situation_based"
        )

    if assessment_type == "master_all":

        if index < 5:
            return "mcq"

        if index < 10:
            return "true_false"

        return "situation_based"

    return "general"


def get_assessment_title(
    chapter_name,
    assessment_type
):
    """
    Build user-facing title.
    """

    chapter_name = str(
        chapter_name or ""
    ).strip()

    if not chapter_name:
        chapter_name = "EDINNO Assessment"

    if assessment_type == "pre_assembly":

        return (
            f"Pre Assembly Quiz - {chapter_name}"
        )

    if assessment_type.startswith(
        "master_"
    ):

        return (
            f"Master Assessment - {chapter_name}"
        )

    return (
        f"Chapter Completion Assessment - {chapter_name}"
    )


def get_assessment_subtitle(
    assessment_type
):
    """
    Subtitle based on assessment mode.
    """

    labels = {
        "pre_assembly":
            "5 basic component-focused MCQs",

        "mcq":
            "Multiple Choice Questions",

        "true_false":
            "True / False Assessment",

        "general":
            "General Questions",

        "matching":
            "Matching Questions",

        "mixed":
            "5 MCQs + 5 True / False",

        "master_mcq_tf":
            "5 MCQs + 5 True / False",

        "master_mcq_situation":
            "5 MCQs + 5 Situation-Based Questions",

        "master_tf_situation":
            "5 True / False + 5 Situation-Based Questions",

        "master_all":
            "5 MCQs + 5 True / False + 5 Situation-Based Questions",
    }

    return labels.get(
        assessment_type,
        "AI Generated Assessment"
    )


# =========================================================
# PDF CREATION
# =========================================================

def create_assessment_pdf(
    chapter_name,
    assessment
):
    """
    Create assessment PDF in memory.

    Returns:
        io.BytesIO
    """

    if not isinstance(
        assessment,
        dict
    ):
        raise ValueError(
            "Invalid assessment data."
        )

    questions = assessment.get(
        "questions"
    )

    if not isinstance(
        questions,
        list
    ) or not questions:
        raise ValueError(
            "No assessment questions available."
        )

    assessment_type = str(
        assessment.get(
            "assessment_type",
            ""
        )
    ).strip().lower()

    is_pre_assembly = (
        assessment_type
        ==
        "pre_assembly"
    )

    is_master = (
        assessment_type.startswith(
            "master_"
        )
    )

    output = io.BytesIO()

    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=get_assessment_title(
            chapter_name,
            assessment_type
        ),
        author="EDINNO AI Assessment"
    )

    styles = getSampleStyleSheet()

    # =====================================================
    # CUSTOM STYLES
    # =====================================================

    title_style = ParagraphStyle(
        "EDINNOTitle",
        parent=styles["Title"],
        fontName="Times-Bold",
        fontSize=19,
        leading=23,
        alignment=TA_CENTER,
        textColor=colors.HexColor(
            "#172033"
        ),
        spaceAfter=8
    )

    subtitle_style = ParagraphStyle(
        "EDINNOSubtitle",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=11,
        leading=15,
        alignment=TA_CENTER,
        textColor=colors.HexColor(
            "#526078"
        ),
        spaceAfter=6
    )

    note_style = ParagraphStyle(
        "EDINNONote",
        parent=styles["Normal"],
        fontName="Times-Italic",
        fontSize=9.5,
        leading=13,
        alignment=TA_CENTER,
        textColor=colors.HexColor(
            "#6f7b8f"
        ),
        spaceAfter=13
    )

    section_heading_style = ParagraphStyle(
        "EDINNOSectionHeading",
        parent=styles["Heading2"],
        fontName="Times-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor(
            "#172033"
        ),
        spaceBefore=6,
        spaceAfter=8
    )

    question_style = ParagraphStyle(
        "EDINNOQuestion",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=11.5,
        leading=16,
        textColor=colors.HexColor(
            "#172033"
        ),
        spaceAfter=7
    )

    body_style = ParagraphStyle(
        "EDINNOBody",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor(
            "#263247"
        ),
        spaceAfter=5
    )

    option_style = ParagraphStyle(
        "EDINNOOption",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10.5,
        leading=14,
        leftIndent=7 * mm,
        firstLineIndent=-4 * mm,
        textColor=colors.HexColor(
            "#263247"
        ),
        spaceAfter=4
    )

    answer_style = ParagraphStyle(
        "EDINNOAnswer",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor(
            "#15805f"
        ),
        backColor=colors.HexColor(
            "#ECFAF4"
        ),
        borderColor=colors.HexColor(
            "#BDEBD9"
        ),
        borderWidth=0.7,
        borderPadding=7,
        borderRadius=5,
        spaceBefore=5,
        spaceAfter=10
    )

    label_style = ParagraphStyle(
        "EDINNOLabel",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor(
            "#6E7C91"
        ),
        spaceAfter=4
    )

    scenario_style = ParagraphStyle(
        "EDINNOScenario",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor(
            "#263247"
        ),
        backColor=colors.HexColor(
            "#FFF9E7"
        ),
        borderColor=colors.HexColor(
            "#E7CF72"
        ),
        borderWidth=0.6,
        borderPadding=8,
        borderRadius=5,
        spaceAfter=8
    )

    answer_key_style = ParagraphStyle(
        "EDINNOAnswerKey",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=10.5,
        leading=14,
        alignment=TA_CENTER,
        textColor=colors.HexColor(
            "#15805f"
        )
    )

    story = []

    # =====================================================
    # HEADER
    # =====================================================

    story.append(
        Paragraph(
            get_assessment_title(
                chapter_name,
                assessment_type
            ),
            title_style
        )
    )

    story.append(
        Paragraph(
            get_assessment_subtitle(
                assessment_type
            ),
            subtitle_style
        )
    )

    if is_pre_assembly:

        story.append(
            Paragraph(
                (
                    "Student Version: answers are not shown "
                    "with the questions. See the Answer Key at the end."
                ),
                note_style
            )
        )

    elif is_master:

        story.append(
            Paragraph(
                (
                    "Final grade-level assessment generated from "
                    "the uploaded learning resources."
                ),
                note_style
            )
        )

    else:

        story.append(
            Paragraph(
                (
                    "Generated from the uploaded chapter learning content."
                ),
                note_style
            )
        )

    story.append(
        Spacer(
            1,
            5
        )
    )

    # =====================================================
    # QUESTIONS
    # =====================================================

    for index, item in enumerate(
        questions
    ):

        question_type = get_question_type(
            item,
            index,
            assessment_type
        )

        question_text = clean_question_text(
            item.get(
                "question",
                ""
            )
        )

        answer = get_answer(
            item
        )

        block = []

        # -------------------------------------------------
        # SITUATION BASED
        # -------------------------------------------------

        if question_type == "situation_based":

            scenario = str(
                item.get(
                    "scenario",
                    item.get(
                        "situation",
                        ""
                    )
                )
            ).strip()

            block.append(
                Paragraph(
                    f"<b>{index + 1}. Situation-Based Question</b>",
                    question_style
                )
            )

            if scenario:

                block.append(
                    Paragraph(
                        "<b>SITUATION</b>",
                        label_style
                    )
                )

                block.append(
                    Paragraph(
                        scenario,
                        scenario_style
                    )
                )

            block.append(
                Paragraph(
                    "<b>QUESTION</b>",
                    label_style
                )
            )

            block.append(
                Paragraph(
                    question_text,
                    body_style
                )
            )

            if answer:

                block.append(
                    Paragraph(
                        (
                            "<b>Expected Answer:</b> "
                            f"{answer}"
                        ),
                        answer_style
                    )
                )

        # -------------------------------------------------
        # MCQ
        # -------------------------------------------------

        elif question_type == "mcq":

            block.append(
                Paragraph(
                    (
                        f"{index + 1}. "
                        f"{question_text}"
                    ),
                    question_style
                )
            )

            options = item.get(
                "options"
            )

            if isinstance(
                options,
                list
            ):

                for option_index, option in enumerate(
                    options
                ):

                    block.append(
                        Paragraph(
                            clean_option_text(
                                option,
                                option_index
                            ),
                            option_style
                        )
                    )

            if (
                not is_pre_assembly
                and
                answer
            ):

                block.append(
                    Paragraph(
                        (
                            "<b>Answer:</b> "
                            f"{answer}"
                        ),
                        answer_style
                    )
                )

        # -------------------------------------------------
        # TRUE / FALSE
        # -------------------------------------------------

        elif question_type == "true_false":

            block.append(
                Paragraph(
                    (
                        f"{index + 1}. "
                        f"{question_text}"
                    ),
                    question_style
                )
            )

            block.append(
                Paragraph(
                    "True &nbsp;&nbsp;&nbsp;&nbsp; False",
                    body_style
                )
            )

            if (
                not is_pre_assembly
                and
                answer
            ):

                block.append(
                    Paragraph(
                        (
                            "<b>Answer:</b> "
                            f"{answer}"
                        ),
                        answer_style
                    )
                )

        # -------------------------------------------------
        # MATCHING
        # -------------------------------------------------

        elif question_type == "matching":

            block.append(
                Paragraph(
                    (
                        f"{index + 1}. "
                        f"{question_text}"
                    ),
                    question_style
                )
            )

            if answer:

                block.append(
                    Paragraph(
                        (
                            "<b>Correct Match:</b> "
                            f"{answer}"
                        ),
                        answer_style
                    )
                )

        # -------------------------------------------------
        # GENERAL
        # -------------------------------------------------

        else:

            block.append(
                Paragraph(
                    (
                        f"{index + 1}. "
                        f"{question_text}"
                    ),
                    question_style
                )
            )

            if answer:

                block.append(
                    Paragraph(
                        (
                            "<b>Answer:</b> "
                            f"{answer}"
                        ),
                        answer_style
                    )
                )

        block.append(
            Spacer(
                1,
                6
            )
        )

        story.append(
            KeepTogether(
                block
            )
        )

    # =====================================================
    # PRE ASSEMBLY ANSWER KEY
    # =====================================================

    if is_pre_assembly:

        story.append(
            PageBreak()
        )

        story.append(
            Paragraph(
                "Answer Key",
                section_heading_style
            )
        )

        answer_data = []

        current_row = []

        for index, item in enumerate(
            questions,
            start=1
        ):

            answer = get_answer(
                item
            )

            cell = Paragraph(
                (
                    f"<b>Q{index}</b><br/>"
                    f"{answer.upper()}"
                ),
                answer_key_style
            )

            current_row.append(
                cell
            )

            if len(current_row) == 5:

                answer_data.append(
                    current_row
                )

                current_row = []

        if current_row:

            while len(current_row) < 5:

                current_row.append(
                    ""
                )

            answer_data.append(
                current_row
            )

        answer_table = Table(
            answer_data,
            colWidths=[
                32 * mm
            ] * 5
        )

        answer_table.setStyle(
            TableStyle(
                [
                    (
                        "BACKGROUND",
                        (0, 0),
                        (-1, -1),
                        colors.HexColor(
                            "#F1FBF7"
                        )
                    ),
                    (
                        "BOX",
                        (0, 0),
                        (-1, -1),
                        0.7,
                        colors.HexColor(
                            "#BDEBD9"
                        )
                    ),
                    (
                        "INNERGRID",
                        (0, 0),
                        (-1, -1),
                        0.5,
                        colors.HexColor(
                            "#D8EEE5"
                        )
                    ),
                    (
                        "VALIGN",
                        (0, 0),
                        (-1, -1),
                        "MIDDLE"
                    ),
                    (
                        "ALIGN",
                        (0, 0),
                        (-1, -1),
                        "CENTER"
                    ),
                    (
                        "TOPPADDING",
                        (0, 0),
                        (-1, -1),
                        9
                    ),
                    (
                        "BOTTOMPADDING",
                        (0, 0),
                        (-1, -1),
                        9
                    ),
                ]
            )
        )

        story.append(
            answer_table
        )

    # =====================================================
    # FOOTER NOTE
    # =====================================================

    story.append(
        Spacer(
            1,
            12
        )
    )

    story.append(
        Paragraph(
            "Generated with EDINNO AI Assessment Engine",
            ParagraphStyle(
                "EDINNOFooter",
                parent=styles["Normal"],
                fontName="Times-Italic",
                fontSize=8,
                leading=10,
                alignment=TA_CENTER,
                textColor=colors.HexColor(
                    "#8A96A8"
                )
            )
        )
    )

    # =====================================================
    # BUILD PDF
    # =====================================================

    document.build(
        story
    )

    output.seek(
        0
    )

    return output
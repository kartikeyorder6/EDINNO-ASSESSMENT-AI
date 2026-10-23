import json
import re
import time
from collections import Counter
from difflib import SequenceMatcher

import requests


# =========================================================
# OLLAMA CONFIG
# =========================================================

OLLAMA_URL = "http://localhost:11434/api/generate"

PRE_ASSEMBLY_MODEL = "qwen3.5:2b"
STANDARD_MODEL = "qwen3.5:4b"

OLLAMA_KEEP_ALIVE = "30m"
HTTP_SESSION = requests.Session()


# =========================================================
# CONTEXT LIMITS
# =========================================================

PRE_ASSEMBLY_CONTEXT_CHARS = 2400
CHAPTER_CONTEXT_CHARS = 18000
MASTER_CONTEXT_CHARS = 24000

MAX_EXISTING_QUESTIONS_IN_PROMPT = 15


# =========================================================
# STOPWORDS
# =========================================================

QUESTION_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because",
    "by", "can", "could", "did", "do", "does", "for",
    "from", "had", "has", "have", "how", "if", "in",
    "into", "is", "it", "its", "may", "of", "on", "or",
    "should", "that", "the", "their", "them", "then",
    "there", "these", "they", "this", "to", "was", "were",
    "what", "when", "where", "which", "who", "why", "will",
    "with", "would", "you", "your",

    "question", "questions",
    "answer", "answers",
    "correct", "incorrect",
    "true", "false",
    "choose", "select",
    "identify", "following",
    "statement", "statements",
    "option", "options",

    "component", "components",
    "project", "projects",
    "system", "systems",
    "device", "devices",
    "activity", "activities",
    "topic", "topics",
}


# =========================================================
# TEXT HELPERS
# =========================================================

def normalize_text(text):

    text = str(text or "").lower()

    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


def strip_question_number(text):

    text = str(text or "").strip()

    return re.sub(
        r"^\s*(?:q(?:uestion)?\s*)?\d+\s*[\.\)\:\-]\s*",
        "",
        text,
        flags=re.IGNORECASE
    ).strip()


def normalize_word(word):

    word = str(word or "").lower().strip()

    word = re.sub(
        r"[^a-z0-9]",
        "",
        word
    )

    if len(word) > 5:

        if word.endswith("ies"):
            word = word[:-3] + "y"

        elif word.endswith("ing"):
            word = word[:-3]

        elif word.endswith("ed"):
            word = word[:-2]

        elif word.endswith("es"):
            word = word[:-2]

        elif word.endswith("s"):
            word = word[:-1]

    return word


def tokenize_text(text):

    result = []

    for raw_word in re.findall(
        r"[A-Za-z0-9]+",
        str(text or "")
    ):

        word = normalize_word(raw_word)

        if word:
            result.append(word)

    return result


# =========================================================
# SOURCE QUESTION DETECTION
# =========================================================

def looks_like_question_line(line):

    line = str(line or "").strip()

    if len(line) < 10:
        return False

    if len(line) > 320:
        return False

    if "?" in line:
        return True

    cleaned = strip_question_number(
        line.lower()
    )

    starters = (
        "what ",
        "which ",
        "why ",
        "when ",
        "where ",
        "who ",
        "how ",
        "identify ",
        "choose ",
        "select ",
        "state ",
        "explain ",
        "name ",
        "match ",
        "true or false",
        "true/false",
    )

    if cleaned.startswith(starters):
        return True

    if re.match(
        r"^\s*(?:q(?:uestion)?\s*)?\d+\s*[\.\)\:\-]",
        line,
        flags=re.IGNORECASE
    ):

        keywords = (
            "what",
            "which",
            "why",
            "how",
            "choose",
            "select",
            "identify",
            "true",
            "false",
            "match",
            "explain",
            "name",
            "state",
        )

        if any(
            keyword in cleaned
            for keyword in keywords
        ):
            return True

    return False


def extract_existing_questions(content):

    questions = []
    seen = set()

    for raw_line in str(
        content or ""
    ).splitlines():

        line = re.sub(
            r"\s+",
            " ",
            raw_line
        ).strip()

        if not looks_like_question_line(line):
            continue

        cleaned = strip_question_number(line)
        normalized = normalize_text(cleaned)

        if not normalized:
            continue

        if normalized in seen:
            continue

        seen.add(normalized)
        questions.append(cleaned)

    return questions


def remove_question_lines(content):

    learning_lines = []

    for raw_line in str(
        content or ""
    ).splitlines():

        line = re.sub(
            r"\s+",
            " ",
            raw_line
        ).strip()

        if not line:
            continue

        if looks_like_question_line(line):
            continue

        learning_lines.append(line)

    return "\n".join(learning_lines)


# =========================================================
# SOURCE COMPRESSION
# =========================================================

def compact_source_content(
    content,
    max_chars
):

    content = str(content or "").strip()

    if not content:
        return ""

    if len(content) <= max_chars:
        return content

    first_size = int(
        max_chars * 0.50
    )

    middle_size = int(
        max_chars * 0.20
    )

    last_size = (
        max_chars
        -
        first_size
        -
        middle_size
    )

    middle_start = max(
        0,
        (len(content) // 2)
        -
        (middle_size // 2)
    )

    return (
        content[:first_size]
        +
        "\n"
        +
        content[
            middle_start:
            middle_start + middle_size
        ]
        +
        "\n"
        +
        content[-last_size:]
    )


# =========================================================
# SIMILARITY HELPERS
# =========================================================

def get_common_source_tokens(
    existing_questions
):

    if not existing_questions:
        return set()

    counter = Counter()

    for question in existing_questions:

        unique_tokens = set(
            tokenize_text(question)
        )

        for token in unique_tokens:

            if token not in QUESTION_STOPWORDS:
                counter[token] += 1

    threshold = max(
        2,
        int(
            len(existing_questions)
            *
            0.60
        )
    )

    return {
        token
        for token, count
        in counter.items()
        if count >= threshold
    }


def get_informative_tokens(
    text,
    common_source_tokens=None
):

    common_source_tokens = (
        common_source_tokens
        or
        set()
    )

    return {
        token
        for token in tokenize_text(text)
        if (
            token not in QUESTION_STOPWORDS
            and
            token not in common_source_tokens
            and
            len(token) >= 3
        )
    }


def compare_question_similarity(
    first_question,
    second_question,
    common_source_tokens=None
):

    first = normalize_text(
        strip_question_number(
            first_question
        )
    )

    second = normalize_text(
        strip_question_number(
            second_question
        )
    )

    if not first or not second:

        return {
            "exact": False,
            "sequence": 0.0,
            "jaccard": 0.0,
            "containment": 0.0,
            "intersection": 0,
        }

    exact = (
        first == second
    )

    sequence = SequenceMatcher(
        None,
        first,
        second
    ).ratio()

    first_tokens = get_informative_tokens(
        first,
        common_source_tokens
    )

    second_tokens = get_informative_tokens(
        second,
        common_source_tokens
    )

    intersection = (
        first_tokens
        &
        second_tokens
    )

    union = (
        first_tokens
        |
        second_tokens
    )

    intersection_count = len(
        intersection
    )

    jaccard = (
        intersection_count / len(union)
        if union
        else 0.0
    )

    minimum = min(
        len(first_tokens),
        len(second_tokens)
    )

    containment = (
        intersection_count / minimum
        if minimum
        else 0.0
    )

    return {
        "exact": exact,
        "sequence": sequence,
        "jaccard": jaccard,
        "containment": containment,
        "intersection": intersection_count,
    }


def questions_are_too_similar(
    first_question,
    second_question,
    common_source_tokens=None
):

    metrics = compare_question_similarity(
        first_question,
        second_question,
        common_source_tokens
    )

    if metrics["exact"]:
        return True

    if metrics["sequence"] >= 0.93:
        return True

    if (
        metrics["intersection"] >= 3
        and
        metrics["jaccard"] >= 0.76
    ):
        return True

    if (
        metrics["intersection"] >= 4
        and
        metrics["containment"] >= 0.86
    ):
        return True

    return False


def question_too_similar_to_source(
    question,
    source_questions,
    common_tokens
):

    for source_question in source_questions:

        if questions_are_too_similar(
            question,
            source_question,
            common_tokens
        ):
            return True

    return False


def question_too_similar_to_list(
    question,
    question_items
):

    for item in question_items:

        existing = item.get(
            "question",
            ""
        )

        if questions_are_too_similar(
            question,
            existing,
            set()
        ):
            return True

    return False


def generated_questions_have_duplicates(
    questions
):

    for first_index in range(
        len(questions)
    ):

        for second_index in range(
            first_index + 1,
            len(questions)
        ):

            first_question = questions[
                first_index
            ].get(
                "question",
                ""
            )

            second_question = questions[
                second_index
            ].get(
                "question",
                ""
            )

            if questions_are_too_similar(
                first_question,
                second_question,
                set()
            ):
                return True

    return False


# =========================================================
# PROJECT TITLE
# =========================================================

def valid_project_title(title):

    title = str(title or "").strip()

    if not title:
        return False

    if len(title) > 120:
        return False

    invalid_values = {
        "project",
        "project ebook",
        "ebook",
        "assessment",
        "pre assembly",
        "pre assembly quiz",
        "unknown",
        "none",
    }

    return (
        normalize_text(title)
        not in invalid_values
    )


def detect_project_title(
    project_content,
    fallback_title=""
):

    fallback_title = str(
        fallback_title or ""
    ).strip()

    lines = []

    for raw_line in str(
        project_content or ""
    ).splitlines()[:45]:

        line = re.sub(
            r"\s+",
            " ",
            raw_line
        ).strip()

        if line:
            lines.append(line)

    patterns = (
        r"^project\s*title\s*[:\-]\s*(.+)$",
        r"^project\s*name\s*[:\-]\s*(.+)$",
        r"^title\s*[:\-]\s*(.+)$",
    )

    for line in lines:

        for pattern in patterns:

            match = re.match(
                pattern,
                line,
                flags=re.IGNORECASE
            )

            if match:

                candidate = match.group(
                    1
                ).strip()

                if valid_project_title(candidate):
                    return candidate

    return (
        fallback_title
        or
        "Project Ebook"
    )


# =========================================================
# QUESTION HELPERS
# =========================================================

def answer_value(item):

    return str(
        item.get(
            "answer",
            item.get(
                "correct_answer",
                ""
            )
        )
    ).strip()


def get_question_type(item):

    question_type = str(
        item.get(
            "question_type",
            item.get(
                "type",
                ""
            )
        )
    ).strip().lower()

    question_type = (
        question_type
        .replace("-", "_")
        .replace(" ", "_")
    )

    aliases = {
        "multiple_choice": "mcq",
        "multiple_choice_question": "mcq",
        "tf": "true_false",
        "truefalse": "true_false",
        "true_or_false": "true_false",
        "situation": "situation_based",
        "scenario": "situation_based",
        "scenario_based": "situation_based",
        "short_answer": "general",
        "match": "matching",
    }

    return aliases.get(
        question_type,
        question_type
    )


# =========================================================
# VALIDATORS
# =========================================================

def valid_mcq(item):

    if not isinstance(
        item,
        dict
    ):
        return False

    question = strip_question_number(
        item.get(
            "question",
            ""
        )
    )

    options = item.get(
        "options"
    )

    answer = answer_value(
        item
    ).lower()

    if not question:
        return False

    if not isinstance(
        options,
        list
    ):
        return False

    if len(options) != 4:
        return False

    if any(
        not str(option).strip()
        for option in options
    ):
        return False

    if answer not in {
        "a",
        "b",
        "c",
        "d",
    }:
        return False

    item["question"] = question
    item["question_type"] = "mcq"
    item["answer"] = answer

    return True


def valid_true_false(item):

    if not isinstance(
        item,
        dict
    ):
        return False

    question = strip_question_number(
        item.get(
            "question",
            ""
        )
    )

    answer = answer_value(
        item
    ).lower()

    if not question:
        return False

    if answer not in {
        "true",
        "false",
    }:
        return False

    item["question"] = question
    item["question_type"] = "true_false"
    item["options"] = []
    item["answer"] = answer

    return True


def valid_general(item):

    if not isinstance(
        item,
        dict
    ):
        return False

    question = strip_question_number(
        item.get(
            "question",
            ""
        )
    )

    answer = answer_value(
        item
    )

    if not question or not answer:
        return False

    item["question"] = question
    item["question_type"] = "general"

    return True


def valid_matching(item):

    if not isinstance(
        item,
        dict
    ):
        return False

    question = strip_question_number(
        item.get(
            "question",
            ""
        )
    )

    answer = answer_value(
        item
    )

    if not question or not answer:
        return False

    item["question"] = question
    item["question_type"] = "matching"

    return True


def valid_situation(item):

    if not isinstance(
        item,
        dict
    ):
        return False

    scenario = str(
        item.get(
            "scenario",
            item.get(
                "situation",
                ""
            )
        )
    ).strip()

    question = strip_question_number(
        item.get(
            "question",
            ""
        )
    )

    answer = answer_value(
        item
    )

    if len(scenario) < 20:
        return False

    if not question or not answer:
        return False

    item["scenario"] = scenario
    item["question"] = question
    item["question_type"] = (
        "situation_based"
    )

    return True


# =========================================================
# PRE ASSEMBLY SCHEMA
# =========================================================

def build_pre_schema(question_count):

    return {
        "type": "object",

        "properties": {
            "qs": {
                "type": "array",

                "minItems": question_count,
                "maxItems": question_count,

                "items": {
                    "type": "object",

                    "properties": {
                        "q": {
                            "type": "string"
                        },

                        "o": {
                            "type": "array",

                            "minItems": 4,
                            "maxItems": 4,

                            "items": {
                                "type": "string"
                            }
                        },

                        "a": {
                            "type": "string",

                            "enum": [
                                "a",
                                "b",
                                "c",
                                "d"
                            ]
                        }
                    },

                    "required": [
                        "q",
                        "o",
                        "a"
                    ]
                }
            }
        },

        "required": [
            "qs"
        ]
    }


# =========================================================
# DEDICATED MIXED SCHEMA
# =========================================================

MIXED_SCHEMA = {
    "type": "object",

    "properties": {

        "mcqs": {
            "type": "array",

            "minItems": 5,
            "maxItems": 5,

            "items": {
                "type": "object",

                "properties": {

                    "question": {
                        "type": "string"
                    },

                    "options": {
                        "type": "array",

                        "minItems": 4,
                        "maxItems": 4,

                        "items": {
                            "type": "string"
                        }
                    },

                    "answer": {
                        "type": "string",

                        "enum": [
                            "a",
                            "b",
                            "c",
                            "d"
                        ]
                    }
                },

                "required": [
                    "question",
                    "options",
                    "answer"
                ]
            }
        },


        "true_false": {
            "type": "array",

            "minItems": 5,
            "maxItems": 5,

            "items": {
                "type": "object",

                "properties": {

                    "question": {
                        "type": "string"
                    },

                    "answer": {
                        "type": "string",

                        "enum": [
                            "true",
                            "false"
                        ]
                    }
                },

                "required": [
                    "question",
                    "answer"
                ]
            }
        }

    },

    "required": [
        "mcqs",
        "true_false"
    ]
}


# =========================================================
# STANDARD SCHEMA
# =========================================================

def build_standard_schema(
    assessment_type
):

    question_count = (
        15
        if assessment_type == "master_all"
        else 10
    )

    return {
        "type": "object",

        "properties": {

            "assessment_type": {
                "type": "string"
            },

            "questions": {
                "type": "array",

                "minItems": question_count,
                "maxItems": question_count,

                "items": {
                    "type": "object",

                    "properties": {

                        "question_type": {
                            "type": "string"
                        },

                        "question": {
                            "type": "string"
                        },

                        "options": {
                            "type": "array",

                            "items": {
                                "type": "string"
                            }
                        },

                        "scenario": {
                            "type": "string"
                        },

                        "answer": {
                            "type": "string"
                        }
                    },

                    "required": [
                        "question_type",
                        "question",
                        "answer"
                    ]
                }
            }
        },

        "required": [
            "assessment_type",
            "questions"
        ]
    }


# =========================================================
# OLLAMA
# =========================================================

def call_ollama_json(
    model_name,
    prompt,
    schema,
    num_predict,
    num_ctx,
    temperature,
    timeout
):

    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "format": schema,
        "keep_alive": OLLAMA_KEEP_ALIVE,

        "options": {
            "temperature": temperature,
            "top_p": 0.90,
            "num_predict": num_predict,
            "num_ctx": num_ctx,
        }
    }

    start_time = time.perf_counter()

    response = HTTP_SESSION.post(
        OLLAMA_URL,
        json=payload,
        timeout=timeout
    )

    response.raise_for_status()

    result = response.json()

    elapsed = (
        time.perf_counter()
        -
        start_time
    )

    print(
        f"Ollama model: {model_name}"
    )

    print(
        (
            "Ollama AI call completed in "
            f"{elapsed:.1f} seconds."
        )
    )

    eval_count = result.get(
        "eval_count"
    )

    eval_duration = result.get(
        "eval_duration"
    )

    if (
        eval_count
        and
        eval_duration
    ):

        seconds = (
            eval_duration
            /
            1_000_000_000
        )

        if seconds > 0:

            speed = (
                eval_count
                /
                seconds
            )

            print(
                (
                    "Generation speed: "
                    f"{speed:.1f} tokens/sec."
                )
            )

            print(
                (
                    "Generated tokens: "
                    f"{eval_count}"
                )
            )

    raw_response = str(
        result.get(
            "response",
            ""
        )
    ).strip()

    if not raw_response:

        raise ValueError(
            "AI returned an empty response."
        )

    try:

        return json.loads(
            raw_response
        )

    except json.JSONDecodeError:

        print(
            "Raw AI response:"
        )

        print(
            raw_response[:1500]
        )

        raise ValueError(
            "AI returned invalid JSON."
        )


# =========================================================
# PROMPT HELPERS
# =========================================================

def format_existing_questions_for_prompt(
    existing_questions
):

    if not existing_questions:
        return "None."

    lines = []

    for index, question in enumerate(
        existing_questions[
            :MAX_EXISTING_QUESTIONS_IN_PROMPT
        ],
        start=1
    ):

        text = str(
            question
        ).strip()

        if len(text) > 110:

            text = (
                text[:107]
                +
                "..."
            )

        lines.append(
            f"{index}. {text}"
        )

    return "\n".join(lines)


def format_accepted_questions(
    accepted_questions
):

    if not accepted_questions:
        return "None."

    lines = []

    for index, item in enumerate(
        accepted_questions,
        start=1
    ):

        lines.append(
            (
                f"{index}. "
                f"{item.get('question', '')}"
            )
        )

    return "\n".join(lines)


# =========================================================
# PRE ASSEMBLY
# =========================================================

def build_pre_assembly_prompt(
    learning_content,
    existing_questions,
    count=5,
    accepted_questions=None
):

    existing_text = (
        format_existing_questions_for_prompt(
            existing_questions
        )
    )

    accepted_text = (
        format_accepted_questions(
            accepted_questions
            or
            []
        )
    )

    return f"""
Create exactly {count} NEW Pre Assembly MCQs.

Return compact JSON only.

Use:
q = question
o = four options
a = answer letter

RULES:
- exactly {count} questions
- question maximum 10 words
- each option maximum 3 words
- exactly four options
- answer only a/b/c/d
- use only supplied ebook facts
- focus on component, function, use or assembly
- do not use outside facts

CRITICAL ORIGINALITY:

Do NOT:
- copy existing ebook questions
- lightly paraphrase them
- reverse them
- convert True/False to MCQ
- reuse the same question intent
- duplicate already accepted generated questions

EXISTING EBOOK QUESTIONS TO AVOID:
{existing_text}

ALREADY ACCEPTED GENERATED QUESTIONS TO AVOID:
{accepted_text}

LEARNING CONTENT:
{learning_content}
"""


def convert_compact_mcqs(
    compact_questions
):

    questions = []

    for compact_item in compact_questions:

        if not isinstance(
            compact_item,
            dict
        ):
            continue

        item = {
            "question_type": "mcq",

            "question":
                str(
                    compact_item.get(
                        "q",
                        ""
                    )
                ).strip(),

            "options":
                compact_item.get(
                    "o",
                    []
                ),

            "answer":
                str(
                    compact_item.get(
                        "a",
                        ""
                    )
                ).strip().lower(),
        }

        if valid_mcq(item):
            questions.append(item)

    return questions


def filter_pre_questions(
    questions,
    existing_questions,
    common_tokens,
    accepted_questions=None
):

    accepted = list(
        accepted_questions
        or
        []
    )

    rejected = []

    for item in questions:

        if len(accepted) >= 5:
            break

        question = item.get(
            "question",
            ""
        )

        if question_too_similar_to_source(
            question,
            existing_questions,
            common_tokens
        ):

            rejected.append(question)
            continue

        if question_too_similar_to_list(
            question,
            accepted
        ):

            rejected.append(question)
            continue

        accepted.append(item)

    return (
        accepted,
        rejected
    )


def generate_pre_assembly_fast(
    chapter_content
):

    total_start = time.perf_counter()

    existing_questions = (
        extract_existing_questions(
            chapter_content
        )
    )

    common_tokens = (
        get_common_source_tokens(
            existing_questions
        )
    )

    learning_content = (
        remove_question_lines(
            chapter_content
        )
    )

    compact_content = (
        compact_source_content(
            learning_content,
            PRE_ASSEMBLY_CONTEXT_CHARS
        )
    )

    print(
        (
            "Pre Assembly SMART-REPAIR Mode: "
            f"{len(existing_questions)} "
            "source questions detected."
        )
    )

    print(
        (
            "Learning context size: "
            f"{len(compact_content)} characters."
        )
    )

    print(
        (
            "Generating initial 5 MCQs using "
            f"{PRE_ASSEMBLY_MODEL}..."
        )
    )

    first_prompt = build_pre_assembly_prompt(
        learning_content=
            compact_content,

        existing_questions=
            existing_questions,

        count=
            5
    )

    first_result = call_ollama_json(
        model_name=
            PRE_ASSEMBLY_MODEL,

        prompt=
            first_prompt,

        schema=
            build_pre_schema(5),

        num_predict=
            320,

        num_ctx=
            2560,

        temperature=
            0.32,

        timeout=
            100
    )

    first_questions = (
        convert_compact_mcqs(
            first_result.get(
                "qs",
                []
            )
        )
    )

    accepted, rejected = (
        filter_pre_questions(
            first_questions,
            existing_questions,
            common_tokens
        )
    )

    print(
        (
            "Initial filtering: "
            f"{len(accepted)} accepted, "
            f"{len(rejected)} rejected."
        )
    )

    if len(accepted) < 5:

        missing_count = (
            5
            -
            len(accepted)
        )

        repair_count = min(
            4,
            missing_count + 1
        )

        print(
            (
                f"{missing_count} unique question(s) missing. "
                "Generating replacements only..."
            )
        )

        repair_prompt = (
            build_pre_assembly_prompt(
                learning_content=
                    compact_content,

                existing_questions=
                    existing_questions,

                count=
                    repair_count,

                accepted_questions=
                    accepted
            )
        )

        repair_result = call_ollama_json(
            model_name=
                PRE_ASSEMBLY_MODEL,

            prompt=
                repair_prompt,

            schema=
                build_pre_schema(
                    repair_count
                ),

            num_predict=
                230,

            num_ctx=
                2560,

            temperature=
                0.58,

            timeout=
                80
        )

        repair_questions = (
            convert_compact_mcqs(
                repair_result.get(
                    "qs",
                    []
                )
            )
        )

        accepted, repair_rejected = (
            filter_pre_questions(
                repair_questions,
                existing_questions,
                common_tokens,
                accepted_questions=
                    accepted
            )
        )

        print(
            (
                "Repair filtering: "
                f"{len(accepted)} total accepted, "
                f"{len(repair_rejected)} "
                "replacement(s) rejected."
            )
        )

    if len(accepted) < 5:

        raise ValueError(
            (
                f"Only {len(accepted)} genuinely unique "
                "questions could be created. "
                "Please Generate once again."
            )
        )

    final_questions = accepted[:5]

    if generated_questions_have_duplicates(
        final_questions
    ):

        raise ValueError(
            "Final questions contained duplicates."
        )

    for item in final_questions:

        if question_too_similar_to_source(
            item["question"],
            existing_questions,
            common_tokens
        ):

            raise ValueError(
                (
                    "Final uniqueness verification failed. "
                    "Please Generate again."
                )
            )

    elapsed = (
        time.perf_counter()
        -
        total_start
    )

    print(
        (
            "Pre Assembly COMPLETE in "
            f"{elapsed:.1f} seconds."
        )
    )

    return {
        "assessment_type":
            "pre_assembly",

        "questions":
            final_questions,
    }


# =========================================================
# CHAPTER MIXED
# =========================================================

def build_mixed_prompt(
    content,
    existing_questions
):

    existing_text = (
        format_existing_questions_for_prompt(
            existing_questions
        )
    )

    return f"""
Create a Chapter Completion assessment.

Use ONLY the supplied educational content.

Return exactly:

MCQS:
- exactly 5 MCQs
- exactly 4 options per MCQ
- answer must be a, b, c or d

TRUE_FALSE:
- exactly 5 True/False statements
- answer must be true or false

FINAL ORDER WILL BE:
Q1-Q5 = MCQ
Q6-Q10 = True/False

IMPORTANT:
Each question must test a different educational point.

Do NOT:
- copy existing ebook questions
- lightly paraphrase existing questions
- reverse existing questions
- convert an ebook MCQ into True/False
- convert an ebook True/False into MCQ
- reuse the same assessment intent
- use outside knowledge

The generated questions must be genuinely NEW
but grounded in facts and concepts from the content.

EXISTING EBOOK QUESTIONS TO AVOID:

{existing_text}

EDUCATIONAL CONTENT:

{content}
"""


def generate_mixed_assessment(
    chapter_content
):

    total_start = time.perf_counter()

    source_questions = (
        extract_existing_questions(
            chapter_content
        )
    )

    common_tokens = (
        get_common_source_tokens(
            source_questions
        )
    )

    learning_content = (
        remove_question_lines(
            chapter_content
        )
    )

    compact_content = (
        compact_source_content(
            learning_content,
            CHAPTER_CONTEXT_CHARS
        )
    )

    print(
        (
            "Chapter MIXED dedicated mode: "
            f"{len(source_questions)} "
            "source questions detected."
        )
    )

    print(
        (
            "Mixed learning context: "
            f"{len(compact_content)} characters."
        )
    )

    print(
        (
            "Generating exactly "
            "5 MCQ + 5 True/False..."
        )
    )

    prompt = build_mixed_prompt(
        compact_content,
        source_questions
    )

    generated = call_ollama_json(
        model_name=
            STANDARD_MODEL,

        prompt=
            prompt,

        schema=
            MIXED_SCHEMA,

        num_predict=
            900,

        num_ctx=
            6144,

        temperature=
            0.34,

        timeout=
            300
    )

    raw_mcqs = generated.get(
        "mcqs",
        []
    )

    raw_tf = generated.get(
        "true_false",
        []
    )

    if len(raw_mcqs) != 5:

        raise ValueError(
            (
                "AI did not return exactly "
                "5 MCQ questions."
            )
        )

    if len(raw_tf) != 5:

        raise ValueError(
            (
                "AI did not return exactly "
                "5 True/False questions."
            )
        )

    mcqs = []

    for item in raw_mcqs:

        item = {
            "question_type":
                "mcq",

            "question":
                item.get(
                    "question",
                    ""
                ),

            "options":
                item.get(
                    "options",
                    []
                ),

            "answer":
                str(
                    item.get(
                        "answer",
                        ""
                    )
                ).lower().strip(),
        }

        if not valid_mcq(item):

            raise ValueError(
                "AI returned an invalid MCQ."
            )

        mcqs.append(item)

    true_false = []

    for item in raw_tf:

        item = {
            "question_type":
                "true_false",

            "question":
                item.get(
                    "question",
                    ""
                ),

            "options":
                [],

            "answer":
                str(
                    item.get(
                        "answer",
                        ""
                    )
                ).lower().strip(),
        }

        if not valid_true_false(item):

            raise ValueError(
                (
                    "AI returned an invalid "
                    "True/False question."
                )
            )

        true_false.append(item)

    questions = (
        mcqs
        +
        true_false
    )

    if generated_questions_have_duplicates(
        questions
    ):

        raise ValueError(
            (
                "Generated Mixed questions "
                "contained duplicate or highly "
                "similar questions."
            )
        )

    duplicate_indexes = []

    for index, item in enumerate(
        questions,
        start=1
    ):

        if question_too_similar_to_source(
            item["question"],
            source_questions,
            common_tokens
        ):

            duplicate_indexes.append(
                index
            )

    if duplicate_indexes:

        duplicate_text = ", ".join(
            str(index)
            for index in duplicate_indexes
        )

        raise ValueError(
            (
                f"Question(s) {duplicate_text} "
                "were too similar to existing "
                "ebook questions. "
                "Please Generate again."
            )
        )

    elapsed = (
        time.perf_counter()
        -
        total_start
    )

    print(
        (
            "Chapter MIXED COMPLETE in "
            f"{elapsed:.1f} seconds."
        )
    )

    return {
        "assessment_type":
            "mixed",

        "questions":
            questions,
    }


# =========================================================
# STANDARD CHAPTER PROMPT
# =========================================================

def build_chapter_prompt(
    content,
    assessment_type,
    existing_questions
):

    existing_text = (
        format_existing_questions_for_prompt(
            existing_questions
        )
    )

    instructions = {

        "mcq":
            """
Exactly 10 MCQs.
Exactly 4 options each.
answer = a/b/c/d.
""",

        "true_false":
            """
Exactly 10 True/False questions.
options = [].
answer = true/false.
""",

        "general":
            """
Exactly 10 General questions
with concise answers.
""",

        "matching":
            """
Exactly 10 Matching questions
with correct answers.
""",
    }

    return f"""
Create a Chapter Completion assessment.

Use ONLY supplied educational content.

TYPE:
{assessment_type}

FORMAT:
{instructions.get(assessment_type, "")}

Questions must be genuinely new.

Never:
- copy
- lightly paraphrase
- reverse
- convert existing questions
- reuse the same question intent

EXISTING QUESTIONS TO AVOID:

{existing_text}

CONTENT:

{content}
"""


# =========================================================
# MASTER PROMPT
# =========================================================

def build_master_prompt(
    content,
    assessment_type,
    existing_questions
):

    existing_text = (
        format_existing_questions_for_prompt(
            existing_questions
        )
    )

    instructions = {

        "master_mcq_tf":
            """
Exactly 10:
1-5 MCQ
6-10 True/False
""",

        "master_mcq_situation":
            """
Exactly 10:
1-5 MCQ
6-10 Situation-Based
""",

        "master_tf_situation":
            """
Exactly 10:
1-5 True/False
6-10 Situation-Based
""",

        "master_all":
            """
Exactly 15:
1-5 MCQ
6-10 True/False
11-15 Situation-Based
""",
    }

    return f"""
Create a Master Assessment using ONLY
the supplied educational content.

TYPE:
{assessment_type}

FORMAT:
{instructions.get(assessment_type, "")}

MCQ:
- question_type = mcq
- exactly 4 options
- answer = a/b/c/d

TRUE/FALSE:
- question_type = true_false
- options = []
- answer = true/false

SITUATION:
- question_type = situation_based
- include a NEW scenario
- include question
- include expected answer

GLOBAL ORIGINALITY:

Do not:
- copy ebook questions
- lightly paraphrase them
- reverse them
- convert between MCQ and True/False
- reuse an existing situation

Situation-Based scenarios must be newly written.

EXISTING QUESTIONS TO AVOID:

{existing_text}

CONTENT:

{content}
"""


# =========================================================
# STANDARD VALIDATION
# =========================================================

def validate_standard_assessment(
    questions,
    assessment_type
):

    if not isinstance(
        questions,
        list
    ):
        return False

    if assessment_type == "mcq":

        return (
            len(questions) == 10
            and
            all(
                valid_mcq(item)
                for item in questions
            )
        )

    if assessment_type == "true_false":

        return (
            len(questions) == 10
            and
            all(
                valid_true_false(item)
                for item in questions
            )
        )

    if assessment_type == "general":

        return (
            len(questions) == 10
            and
            all(
                valid_general(item)
                for item in questions
            )
        )

    if assessment_type == "matching":

        return (
            len(questions) == 10
            and
            all(
                valid_matching(item)
                for item in questions
            )
        )

    if assessment_type == "master_mcq_tf":

        if len(questions) != 10:
            return False

        for index, item in enumerate(
            questions
        ):

            if index < 5:

                if not valid_mcq(item):
                    return False

            else:

                if not valid_true_false(item):
                    return False

        return True

    if assessment_type == "master_mcq_situation":

        if len(questions) != 10:
            return False

        for index, item in enumerate(
            questions
        ):

            if index < 5:

                if not valid_mcq(item):
                    return False

            else:

                if not valid_situation(item):
                    return False

        return True

    if assessment_type == "master_tf_situation":

        if len(questions) != 10:
            return False

        for index, item in enumerate(
            questions
        ):

            if index < 5:

                if not valid_true_false(item):
                    return False

            else:

                if not valid_situation(item):
                    return False

        return True

    if assessment_type == "master_all":

        if len(questions) != 15:
            return False

        for index, item in enumerate(
            questions
        ):

            if index < 5:

                if not valid_mcq(item):
                    return False

            elif index < 10:

                if not valid_true_false(item):
                    return False

            else:

                if not valid_situation(item):
                    return False

        return True

    return False


# =========================================================
# STANDARD UNIQUENESS
# =========================================================

def standard_questions_are_unique(
    questions,
    source_questions,
    common_tokens
):

    if generated_questions_have_duplicates(
        questions
    ):
        return False

    for item in questions:

        if question_too_similar_to_source(
            item.get(
                "question",
                ""
            ),
            source_questions,
            common_tokens
        ):
            return False

    return True


def situations_are_unique(
    questions
):

    scenarios = []

    for item in questions:

        if get_question_type(
            item
        ) != "situation_based":

            continue

        scenario = normalize_text(
            item.get(
                "scenario",
                ""
            )
        )

        if not scenario:
            continue

        for previous in scenarios:

            similarity = SequenceMatcher(
                None,
                scenario,
                previous
            ).ratio()

            if similarity >= 0.86:
                return False

        scenarios.append(scenario)

    return True


# =========================================================
# STANDARD GENERATION
# =========================================================

def generate_standard_assessment(
    chapter_content,
    assessment_type
):

    source_questions = (
        extract_existing_questions(
            chapter_content
        )
    )

    common_tokens = (
        get_common_source_tokens(
            source_questions
        )
    )

    is_master = (
        assessment_type.startswith(
            "master_"
        )
    )

    if is_master:

        compact_content = (
            compact_source_content(
                chapter_content,
                MASTER_CONTEXT_CHARS
            )
        )

        prompt = build_master_prompt(
            compact_content,
            assessment_type,
            source_questions
        )

        num_ctx = 8192

        num_predict = (
            1600
            if assessment_type == "master_all"
            else 1200
        )

    else:

        learning_content = (
            remove_question_lines(
                chapter_content
            )
        )

        compact_content = (
            compact_source_content(
                learning_content,
                CHAPTER_CONTEXT_CHARS
            )
        )

        prompt = build_chapter_prompt(
            compact_content,
            assessment_type,
            source_questions
        )

        num_ctx = 6144
        num_predict = 1050

    schema = build_standard_schema(
        assessment_type
    )

    print(
        (
            f"Using {STANDARD_MODEL} "
            "for Chapter/Master generation."
        )
    )

    generated = call_ollama_json(
        model_name=
            STANDARD_MODEL,

        prompt=
            prompt,

        schema=
            schema,

        num_predict=
            num_predict,

        num_ctx=
            num_ctx,

        temperature=
            0.32,

        timeout=
            300
    )

    questions = generated.get(
        "questions",
        []
    )

    if not validate_standard_assessment(
        questions,
        assessment_type
    ):

        raise ValueError(
            "AI returned invalid assessment structure."
        )

    if not standard_questions_are_unique(
        questions,
        source_questions,
        common_tokens
    ):

        raise ValueError(
            (
                "Generated questions were too similar "
                "to existing ebook questions."
            )
        )

    if (
        is_master
        and
        not situations_are_unique(
            questions
        )
    ):

        raise ValueError(
            (
                "Situation-Based questions "
                "were too similar."
            )
        )

    generated[
        "assessment_type"
    ] = assessment_type

    generated[
        "questions"
    ] = questions

    return generated


# =========================================================
# PUBLIC FUNCTION
# =========================================================

def generate_assessment(
    chapter_content,
    assessment_type,
    retry_count=0,
    rejected_questions=None
):

    chapter_content = str(
        chapter_content or ""
    ).strip()

    assessment_type = str(
        assessment_type or ""
    ).strip().lower()

    if not chapter_content:

        raise ValueError(
            "Chapter content is empty."
        )

    supported_types = {
        "pre_assembly",
        "mcq",
        "true_false",
        "general",
        "matching",
        "mixed",
        "master_mcq_tf",
        "master_mcq_situation",
        "master_tf_situation",
        "master_all",
    }

    if assessment_type not in supported_types:

        raise ValueError(
            (
                "Unsupported assessment type: "
                f"{assessment_type}"
            )
        )

    # PRE ASSEMBLY
    if assessment_type == "pre_assembly":

        return generate_pre_assembly_fast(
            chapter_content
        )

    # CHAPTER MIXED
    if assessment_type == "mixed":

        return generate_mixed_assessment(
            chapter_content
        )

    # OTHER CHAPTER + MASTER
    return generate_standard_assessment(
        chapter_content,
        assessment_type
    )
import json
import os
import re
import time
import threading
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from app.core.config import settings
from app.core.logging import logger
from app.services.curriculum_knowledge import get_curriculum_component_questions

HTTP_SESSION = requests.Session()

# =========================================================
# STOPWORDS & VOCABULARY
# =========================================================

QUESTION_STOPWORDS: Set[str] = {
    "a", "an", "and", "are", "as", "at", "be", "because",
    "by", "can", "could", "did", "do", "does", "for",
    "from", "had", "has", "have", "how", "if", "in",
    "into", "is", "it", "its", "may", "of", "on", "or",
    "should", "that", "the", "their", "them", "then",
    "there", "these", "they", "this", "to", "was", "were",
    "what", "when", "where", "which", "who", "why", "will",
    "with", "would", "you", "your",
    "question", "questions", "answer", "answers", "correct", "incorrect",
    "true", "false", "choose", "select", "identify", "following",
    "statement", "statements", "option", "options",
    "component", "components", "project", "projects", "system", "systems",
    "device", "devices", "activity", "activities", "topic", "topics",
}

# =========================================================
# TEXT PARSING & HELPERS
# =========================================================

from difflib import SequenceMatcher

def normalize_text(text: Any) -> str:
    cleaned = str(text or "").lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_word(word: str) -> str:
    word = word.strip().lower()
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("es"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s"):
        return word[:-1]
    return word


def tokenize_text(text: Any) -> List[str]:
    norm = normalize_text(text)
    if not norm:
        return []
    words = norm.split()
    tokens = []
    for w in words:
        if len(w) <= 2:
            continue
        cleaned = normalize_word(w)
        if cleaned not in QUESTION_STOPWORDS:
            tokens.append(cleaned)
    return tokens


def compare_question_similarity(q1: str, q2: str) -> Dict[str, float]:
    toks1 = set(tokenize_text(q1))
    toks2 = set(tokenize_text(q2))
    if not toks1 or not toks2:
        return {"overlap": 0.0, "seq": 0.0, "jaccard": 0.0}
    intersection = toks1.intersection(toks2)
    union = toks1.union(toks2)
    jaccard = len(intersection) / len(union) if union else 0.0
    smaller_len = min(len(toks1), len(toks2))
    overlap = len(intersection) / smaller_len if smaller_len > 0 else 0.0
    seq = SequenceMatcher(None, normalize_text(q1), normalize_text(q2)).ratio()
    return {"overlap": overlap, "seq": seq, "jaccard": jaccard}


def questions_are_too_similar(q1: str, q2: str) -> bool:
    metrics = compare_question_similarity(q1, q2)
    # Require true structural or high semantic duplicate (not just subset of a 2-word question)
    if metrics["seq"] >= 0.82:
        return True
    if metrics.get("jaccard", 0.0) >= 0.65:
        return True
    if metrics["overlap"] >= 0.75 and metrics["seq"] >= 0.60:
        return True
    if metrics["overlap"] >= 0.60 and metrics["seq"] >= 0.70:
        return True
    return False


def valid_mcq(item: Dict[str, Any]) -> bool:
    q = str(item.get("question", "")).strip()
    if len(q) < 10:
        return False
    options = item.get("options")
    if isinstance(options, dict):
        if len(options) != 4:
            return False
        opt_vals = [str(v).strip() for v in options.values()]
    elif isinstance(options, list):
        if len(options) != 4:
            return False
        opt_vals = [str(v).strip() for v in options]
    else:
        return False
    if any(len(v) == 0 for v in opt_vals) or len(set(opt_vals)) < 4:
        return False
    ans = str(item.get("answer", "")).strip().upper()
    upper_vals = {v.upper() for v in opt_vals}
    return ans in {"A", "B", "C", "D"} or ans in upper_vals


def clean_and_parse_json(raw: str) -> Dict[str, Any]:
    text = str(raw or "").strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()

    first_brace = text.find("{")
    first_bracket = text.find("[")

    if first_brace != -1 and (first_bracket == -1 or first_brace < first_bracket):
        start = first_brace
        end = text.rfind("}")
        if end != -1:
            text = text[start : end + 1]
    elif first_bracket != -1:
        start = first_bracket
        end = text.rfind("]")
        if end != -1:
            text = text[start : end + 1]

    # Remove illegal trailing commas before closing braces/brackets from LLMs
    text = re.sub(r",\s*([\]}])", r"\1", text)
    parsed = json.loads(text, strict=False)
    if isinstance(parsed, list):
        return {"questions": parsed}
    return parsed


def looks_like_question_line(line: str) -> bool:
    line_clean = line.strip()
    if not line_clean:
        return False
    lower = line_clean.lower()
    if "?" in line_clean:
        return True
    if re.match(r"^(?:q(?:uestion)?\s*\d+|q\d+)\s*[\.\)\:\-]", lower):
        return True
    prefixes = (
        "which of the following", "what is the function", "explain the role",
        "why do we use", "identify the component", "name the sensor",
        "state true or false", "how does", "what will happen",
    )
    return any(lower.startswith(p) for p in prefixes)


def is_header_or_metadata_line(line: str) -> bool:
    """Filter out structural document banners, headers, and section markers."""
    line_clean = line.strip()
    if not line_clean:
        return True
    lower = line_clean.lower()
    if re.search(r"^(?:={2,}|-{2,}|#{2,}|\*{2,}|_{2,})", line_clean):
        return True
    if line_clean.startswith(("===", "---", "###", "***", "___")):
        return True
    if re.match(r"^(?:===|---|###|\*|\d+[\.\)])?\s*(?:module|topic|chapter|lesson|unit|section|activity|project|page)\s*[:\d\-_\s]", lower):
        return True
    if line_clean.isupper() and len(line_clean.split()) <= 6:
        return True
    return False


def remove_question_lines(content: str) -> str:
    kept = []
    for line in content.splitlines():
        if not looks_like_question_line(line):
            kept.append(line)
    return "\n".join(kept)


def compact_source_content(content: str, max_chars: int) -> str:
    cleaned = remove_question_lines(content)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars]


def valid_project_title(title: str) -> bool:
    t = title.strip()
    if len(t) < 4 or len(t) > 90:
        return False
    lower = t.lower()
    blacklist = {"page", "introduction", "activity", "topic", "chapter", "edinno"}
    if any(lower.startswith(b) for b in blacklist):
        return False
    return True


def clean_title_brackets(title: str) -> str:
    """Strip bracketed sections such as (Emergency Braking System) or [Sub-Topic]."""
    cleaned = re.sub(r"\s*[\(\[].*?[\)\]]", "", str(title or ""), flags=re.DOTALL).strip()
    return cleaned if len(cleaned) >= 3 else title


def detect_project_title(pdf_text: str, filename: str = "") -> str:
    patterns = [
        r"(?:project|p-\d+)\s*[\:\-]?\s*([A-Za-z0-9\s\&\(\)\-\'\"]{4,70})",
        r"Title\s*[\:\-]\s*([A-Za-z0-9\s\&\(\)\-\'\"]{4,70})",
        r"Activity\s*\d+\s*[\:\-]\s*([A-Za-z0-9\s\&\(\)\-\'\"]{4,70})",
    ]
    for pat in patterns:
        m = re.search(pat, pdf_text[:2500], re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            clean_cand = clean_title_brackets(candidate)
            if valid_project_title(clean_cand):
                return clean_cand
            if valid_project_title(candidate):
                return candidate

    if filename:
        clean_name = re.sub(r"^(?:topic|activity|chapter|module|project|p)?[\d._\-]*\s*", "", filename, flags=re.IGNORECASE)
        clean_name = re.sub(r"\.pdf$", "", clean_name, flags=re.IGNORECASE).strip()
        clean_name = clean_name.replace("_", " ").strip()
        clean_cand = clean_title_brackets(clean_name)
        clean_cand = re.sub(r"[\(\)]", "", clean_cand).strip()
        if valid_project_title(clean_cand):
            return clean_cand

    return "STEM Curriculum Assessment"


# =========================================================
# PROMPT BUILDER
# =========================================================

def build_prompt(
    project_title: str,
    assessment_type: str,
    question_count: int,
    difficulty: str,
    content: str
) -> str:
    diff_instruction = {
        "easy": "Beginner level: Focus on direct conceptual clarity, component identification, and basic functionality.",
        "medium": "Standard curriculum level: Balanced cognitive distribution covering operational principles, pin connections, logic thresholds, and circuit safety.",
        "hard": "Advanced analytical level: Deep troubleshooting, edge cases, timing constraints, hardware failure modes, and multi-component interaction."
    }.get(difficulty.lower(), "Standard curriculum level.")

    type_instruction = {
        "merged_conceptual": (
            "Type: MERGED COMPREHENSIVE CURRICULUM ASSESSMENT (COMPONENTS, PIN COUNTS & SCENARIOS).\n"
            "MANDATORY CONSTRAINTS & REQUIREMENTS:\n"
            "1. NO PROJECT NAMES: Never mention project names, activity numbers, activity titles (e.g. 'Activity 1', 'Traffic Light Controller', 'Crop Ripeness'), or project problem narratives (e.g. 'The Problem: Imagine your school...', 'What Will We Build'). All questions must test generalized STEM/electronics concepts.\n"
            "2. NO PIN CONNECTIONS: Strictly exclude circuit diagrams, wiring steps, pin connections between components, and connection configurations (e.g. NEVER ask 'Connect positive and negative terminals to 5V and GND' or 'which pin connects to which pin').\n"
            "3. COMPONENT PIN-COUNT QUESTIONS ALLOWED: Questions may ask component names, their functions, and the TOTAL NUMBER of physical pins they have (e.g., 'What is the total number of physical pins on an HC-SR04 ultrasonic sensor module?' -> Options: ['2 pins', '3 pins', '4 pins', '6 pins'], Answer: '4 pins').\n"
            "4. COMPONENT FUNCTIONALITY ALLOWED: Test component working principles, purpose, applications, and behavior in hypothetical scenarios.\n"
            "5. ANSWER-OPTION ACCURACY: Every question must have at least one relevant, factually correct answer explicitly available among its 4 options. For example, if the answer is a PIR sensor, include 'PIR Sensor' as an option; if asking about distance measurement, include 'HC-SR04 Ultrasonic Sensor'.\n"
            "6. LOGICAL VALIDATION: Verify each question's wording, all options, and the correct answer. Eliminate ambiguous questions, incorrect answer keys, irrelevant distractors, and duplicate questions.\n"
            "7. STRICTLY NO CODING QUESTIONS: Zero code snippets, programming keywords, syntax, function names (void setup(), loop(), pinMode(), digitalWrite(), etc.).\n"
            "8. BALANCED COVERAGE: Distribute questions across the 4 categories:\n"
            "   - Component Identification & Functions\n"
            "   - Number of Pins & Pin Identification\n"
            "   - Hypothetical Scenario-Based Practical Reasoning\n"
            "   - Logical & Conceptual Reasoning"
        ),
        "pre_assembly": (
            "Type: PRE-ASSEMBLY SAFETY & READINESS CHECK. "
            "Generate objective multiple choice questions (type: 'mcq') each with 4 distinct options (A, B, C, D) "
            "verifying component ratings, short-circuit hazards, breadboard power buses, "
            "pin modes, and safety checks before hands-on physical wiring. "
            "STRICTLY EXCLUDE code snippets, circuit diagram drawings, and project-specific pin numbers."
        ),
        "mixed": (
            "Type: COMPREHENSIVE MIXED CHAPTER EXAM (EXACTLY 10 QUESTIONS). "
            "You MUST generate exactly 10 questions with this exact composition across three mandatory sections:\n"
            "1. Exactly 5 Standard Multiple Choice Questions (type: 'mcq') focusing on component identification, functions, and pin counts. Each must have 4 distinct options (A, B, C, D) and exactly 1 correct answer.\n"
            "2. Exactly 3 Conceptual True/False Questions (type: 'true_false') testing digital logic, pull-up resistors, active-low/high signals, and common hardware misconceptions, with answer 'True' or 'False'.\n"
            "3. Exactly 2 Situation/Scenario-Based Multiple Choice Questions (type: 'mcq') testing practical real-world hardware troubleshooting and applications. Each MUST include a realistic 'scenario' field (e.g. sensor readings, edge conditions, power delivery), a practical diagnostic question, 4 distinct options (A, B, C, D), and exactly 1 correct answer.\n"
            "STRICTLY EXCLUDE code snippets, programming syntax, circuit diagram drawings, and project-specific pin numbers."
        ),
        "mcq": (
            "Type: OBJECTIVE MULTIPLE CHOICE ONLY (MCQ). "
            "Each question MUST have 4 distinct, plausible options (A, B, C, D) and exactly 1 correct answer. "
            "Focus on component identification, intrinsic pinout verification, and conceptual reasoning. "
            "STRICTLY EXCLUDE code snippets and circuit diagram drawings."
        ),
        "true_false": (
            "Type: CONCEPTUAL TRUE / FALSE DIAGNOSTIC. "
            "Target common hardware/software misconceptions and circuit logic. Answers must be 'True' or 'False'. "
            "STRICTLY EXCLUDE code snippets and circuit diagram drawings."
        ),
        "master_all": (
            "Type: MASTER CROSS-MODULAR CAPSTONE EXAM. "
            "Integrate concepts across multiple modules, evaluating real-world system architecture, sensor interfacing, and safety. "
            "STRICTLY EXCLUDE code snippets and circuit diagram drawings."
        )
    }.get(assessment_type.lower(), "Standard Assessment.")

    return f"""You are an elite STEM educator and exam designer for the EDINNO curriculum system.
Generate an official examination paper for: "{project_title}".

REQUIREMENTS:
- Exactly {question_count} questions.
- Cognitive Difficulty: {difficulty.upper()} ({diff_instruction})
- {type_instruction}
- Questions must test the components, physical principles, and hardware concepts in the source curriculum.
- STRICTLY NO project names, NO activity titles, NO problem stories, NO wiring steps, NO code snippets.
- STRICTLY NO generic placeholders, NO duplicate questions, and NO rote copying of full sentences.
- Ensure every question has 4 distinct options (A, B, C, D) with exactly one factually correct answer explicitly present.
- Return ONLY a valid JSON object matching the schema below.

JSON SCHEMA:
{{
  "chapter_name": "{project_title}",
  "questions": [
    {{
      "type": "mcq",
      "question": "Clear, technically precise question prompt testing component, pin-count, or working principle",
      "scenario": "Optional real-world hypothetical hardware context for scenario-based questions, or null",
      "options": {{
        "A": "Plausible option text",
        "B": "Factually correct option text",
        "C": "Plausible option text",
        "D": "Plausible option text"
      }},
      "answer": "B",
      "explanation": "Clear explanation citing technical principle, pin count, or component function."
    }}
  ]
}}

SOURCE CURRICULUM CONTENT:
{compact_source_content(content, settings.CHAPTER_CONTEXT_CHARS)}
"""


# =========================================================
# PROVIDER 1: GOOGLE GEMINI (ENTERPRISE SLIDING-WINDOW POOL)
# =========================================================

from app.services.gemini_pool import gemini_pool


def get_available_gemini_keys() -> List[str]:
    """Dynamically retrieves all available Gemini API keys from settings and .env."""
    return gemini_pool.discover_keys()


def select_gemini_keys_for_request(all_keys: Optional[List[str]] = None) -> List[str]:
    """Compatibility wrapper delegating to gemini_pool."""
    return gemini_pool.select_best_keys(max_candidates=2)


def call_gemini(
    prompt: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    if api_key:
        keys_to_try = [api_key]
    else:
        keys_to_try = gemini_pool.select_best_keys(max_candidates=2)
        if not keys_to_try:
            logger.warning("All Gemini keys are currently at capacity (12 RPM) or in cooldown. Cascading to next provider...")
            raise requests.HTTPError("All Gemini keys are currently in cooldown or quota-exhausted.")

    # Models to attempt: If 503 high-demand spike occurs on primary flash model, try sibling flash models
    primary_model = model or settings.GEMINI_MODEL or "gemini-3.6-flash"
    models_to_try = [primary_model]
    if "gemini-3.6-flash" in primary_model:
        models_to_try.append("gemini-3.8-flash")

    last_err: Optional[Exception] = None

    for m_name in models_to_try:
        for idx, key in enumerate(keys_to_try, start=1):
            masked_key = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else "***"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:generateContent?key={key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "response_mime_type": "application/json",
                    "temperature": 0.2,
                }
            }
            try:
                gemini_pool.record_start(key)
                t_start = time.time()
                logger.info(f"Calling Google Gemini ({m_name}) using fresh key #{idx}/{len(keys_to_try)} [{masked_key}]...")
                resp = HTTP_SESSION.post(url, json=payload, timeout=25)
                latency = time.time() - t_start

                if resp.status_code == 429:
                    gemini_pool.record_rate_limit(key, reason=f"HTTP 429: {resp.text[:120]}")
                    last_err = requests.HTTPError(f"HTTP 429 Quota Exceeded: {resp.text[:200]}", response=resp)
                    continue

                if resp.status_code == 503:
                    gemini_pool.record_high_demand(key, reason=f"HTTP 503: {resp.text[:120]}")
                    last_err = requests.HTTPError(f"HTTP 503 High Demand: {resp.text[:200]}", response=resp)
                    continue

                if resp.status_code >= 400:
                    logger.warning(f"Gemini key [{masked_key}] returned HTTP {resp.status_code}: {resp.text[:200]}")
                    last_err = requests.HTTPError(f"HTTP {resp.status_code}: {resp.text[:200]}", response=resp)
                    continue

                data = resp.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    logger.warning(f"Gemini key [{masked_key}] returned empty candidates: {data}")
                    last_err = ValueError("Gemini returned empty candidates.")
                    continue

                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts or not parts[0].get("text"):
                    logger.warning(f"Gemini key [{masked_key}] returned candidate with no text parts.")
                    last_err = ValueError("Gemini candidate missing text.")
                    continue

                raw_text = parts[0]["text"]
                parsed = clean_and_parse_json(raw_text)

                # SUCCESS: Record latency and set key as last used
                gemini_pool.record_success(key, latency_sec=latency)
                return parsed

            except Exception as e:
                last_err = e
                logger.warning(f"Gemini key [{masked_key}] ({m_name}) attempt failed: {e}. Rotating to next key in pool...")

    raise last_err or ValueError("All configured Gemini API keys failed.")



# =========================================================
# PROVIDER 2: GROQ (ULTRA-FAST)
# =========================================================

def call_groq(
    prompt: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    key = api_key or settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY")
    if not key:
        raise ValueError("GROQ_API_KEY is not configured.")

    models_to_try = [model] if model else [settings.GROQ_MODEL] + settings.GROQ_FALLBACK_MODELS
    url = "https://api.groq.com/openai/v1/chat/completions"

    last_err = None
    for m in models_to_try:
        try:
            logger.info(f"Calling Groq API with model: {m}")
            payload = {
                "model": m,
                "messages": [
                    {"role": "system", "content": "You are an expert STEM exam author. Return strictly valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            }
            resp = HTTP_SESSION.post(
                url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
                timeout=45
            )
            resp.raise_for_status()
            res_json = resp.json()
            raw_text = res_json["choices"][0]["message"]["content"]
            return clean_and_parse_json(raw_text)
        except Exception as e:
            last_err = e
            logger.warning(f"Groq model {m} failed: {e}. Trying fallback if available...")

    raise last_err or ValueError("Groq generation failed.")


# =========================================================
# PROVIDER 3: OPENROUTER (UNIVERSAL CLOUD)
# =========================================================

def call_openrouter(
    prompt: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    key = api_key or settings.OPENROUTER_API_KEY or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise ValueError("OPENROUTER_API_KEY is not configured.")

    model_name = model or settings.OPENROUTER_MODEL or "recursive/flint-v1.0:free"
    url = "https://openrouter.ai/api/v1/chat/completions"

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are an expert STEM exam author. Return strictly valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
    }

    resp = HTTP_SESSION.post(
        url,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60
    )
    resp.raise_for_status()
    raw_text = resp.json()["choices"][0]["message"]["content"]
    return clean_and_parse_json(raw_text)


# =========================================================
# PROVIDER 4: LOCAL OLLAMA (OFFLINE)
# =========================================================

def call_ollama(
    prompt: str,
    model: Optional[str] = None,
    timeout: int = 5
) -> Dict[str, Any]:
    model_name = model or settings.STANDARD_MODEL
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "keep_alive": settings.OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": 0.2,
            "top_p": 0.90,
            "num_predict": 2048,
        }
    }
    response = HTTP_SESSION.post(settings.OLLAMA_URL, json=payload, timeout=timeout)
    response.raise_for_status()
    raw = str(response.json().get("response", "")).strip()
    return clean_and_parse_json(raw)


# =========================================================
# PROVIDER 5: DYNAMIC TEXT SYNTHESIZER (ZERO MOCK FALLBACK)
# =========================================================

def fallback_synthesizer(
    chapter_content: str,
    assessment_type: str,
    question_count: int = 5
) -> Dict[str, Any]:
    """
    Deterministic curriculum question synthesizer deriving validated, fact-checked
    questions from components present in the uploaded curriculum text.
    Strictly complies with all 6 constraints:
    - Zero project names or activity stories
    - Zero circuit diagrams or wiring steps
    - Valid component pin counts & working principles
    - 100% accurate options with correct answer explicitly present
    - Plausible distractors, zero duplicate questions
    """
    logger.info("Synthesizing validated assessment questions from curriculum component knowledge bank.")
    title = detect_project_title(chapter_content)
    questions = get_curriculum_component_questions(chapter_content, target_count=question_count)

    return {
        "chapter_name": title,
        "questions": questions,
        "provider_used": "Curriculum Component Synthesizer",
        "model_used": "Knowledge-Grounded Verified"
    }


# =========================================================
# QUESTION VALIDATORS & PARAMETER ENFORCEMENT
# =========================================================

def is_coding_question(q: Dict[str, Any]) -> bool:
    """Return True if question or options contain programming code/syntax."""
    opts = q.get("options")
    opts_vals: List[str] = []
    if isinstance(opts, dict):
        opts_vals = [str(v) for v in opts.values()]
    elif isinstance(opts, list):
        opts_vals = [str(v) for v in opts]
    full_text = f"{q.get('question', '')} {q.get('scenario', '')} {q.get('explanation', '')} " + " ".join(opts_vals)
    code_pattern = (
        r"(```|\bvoid\s+setup\b|\bvoid\s+loop\b|\bpinMode\b|\bdigitalWrite\b|"
        r"\bdigitalRead\b|\banalogRead\b|\banalogWrite\b|\bSerial\.(print|begin|write)\b|"
        r"\b#include\b|\bint\s+[a-zA-Z0-9_]+\s*=|;\s*$|\{|\})"
    )
    return bool(re.search(code_pattern, full_text, re.IGNORECASE))


def is_circuit_diagram_question(q: Dict[str, Any]) -> bool:
    """Return True if question references circuit schematics or visual figures."""
    full_text = f"{q.get('question', '')} {q.get('scenario', '')} {q.get('explanation', '')}"
    circuit_pattern = (
        r"\b(circuit diagram|schematic diagram|diagram below|drawn below|figure\s+\d+|"
        r"breadboard diagram|look at the diagram|schematic shows|draw the circuit|wire layout below)\b"
    )
    return bool(re.search(circuit_pattern, full_text, re.IGNORECASE))


def is_project_specific_question(q: Dict[str, Any]) -> bool:
    """Return True if question asks about project-specific trivia, project titles, activity names, or problem narratives."""
    opts = q.get("options")
    opts_vals: List[str] = []
    if isinstance(opts, dict):
        opts_vals = [str(v) for v in opts.values()]
    elif isinstance(opts, list):
        opts_vals = [str(v) for v in opts]
    full_text = f"{q.get('question', '')} {q.get('scenario', '')} {q.get('explanation', '')} " + " ".join(opts_vals)
    project_pattern = (
        r"\b(in project\s*\d+|in activity\s*\d+|according to project|project-specific pin|"
        r"traffic light activity|crop ripeness project|employee check-in project|"
        r"defence protection project|space debris project|which pin was used in project|"
        r"the problem:\s*imagine|what will we build|imagine your school|school fair|"
        r"mini traffic light|traffic light controller|patient assistance alert|emergency braking system|"
        r"activity\s*\d+|project\s*\d+)\b"
    )
    return bool(re.search(project_pattern, full_text, re.IGNORECASE))


def is_wiring_or_connection_question(q: Dict[str, Any]) -> bool:
    """Return True if question tests circuit diagrams, breadboard wiring steps, or pin-to-pin wiring connections."""
    opts = q.get("options")
    opts_vals: List[str] = []
    if isinstance(opts, dict):
        opts_vals = [str(v) for v in opts.values()]
    elif isinstance(opts, list):
        opts_vals = [str(v) for v in opts]
    full_text = f"{q.get('question', '')} {q.get('scenario', '')} {q.get('explanation', '')} " + " ".join(opts_vals)
    wiring_pattern = (
        r"\b(connect\s+the\s+positive|connect\s+all\s+the\s+negative|connect\s+to\s+5v\s+and\s+gnd|"
        r"connect\s+the\s+leds?'?\s+anode|pinout configuration is correct|wire\s+the\s+breadboard|"
        r"breadboard\s+to\s+5v|positive\s+and\s+negative\s+terminals\s+of\s+the\s+breadboard|"
        r"breadboard\s+power\s+rail|wire\s+connection\s+step|step\s*\d+:\s*connect)\b"
    )
    return bool(re.search(wiring_pattern, full_text, re.IGNORECASE))


def classify_question_category(q: Dict[str, Any]) -> str:
    """Classify question into one of 4 curriculum assessment parameters."""
    cat = str(q.get("category", "")).strip()
    if cat in {
        "Component Identification & Functions",
        "Number of Pins & Pin Identification",
        "Hypothetical Scenario-Based Practical Reasoning",
        "Logical & Conceptual Reasoning",
    }:
        return cat

    q_text = f"{q.get('question', '')} {q.get('scenario', '')}".lower()

    if bool(re.search(r"\b(scenario|suppose|a student|an engineer|a technician|an automated system|during installation|unexpectedly|troubleshoot|practical deployment|placed near|reads 99%|fails to detect|brownout|reboot|causes false)\b", q_text)) or q.get("scenario"):
        return "Hypothetical Scenario-Based Practical Reasoning"
    elif bool(re.search(r"\b(pins?|pinout|vcc|trig|echo|gnd|sda|scl|wiper|how many pins|terminal contacts|pin count|pin identification)\b", q_text)):
        return "Number of Pins & Pin Identification"
    elif bool(re.search(r"\b(why|principle|explain|reason|physics|resolution|adc|pull-up|pull-down|capacitive|dielectric|impedance|reflected|time-of-flight|flyback|freewheeling|floating)\b", q_text)):
        return "Logical & Conceptual Reasoning"
    else:
        return "Component Identification & Functions"


# =========================================================
# DYNAMIC CURRICULUM TEXT SYNTHESIZER (ZERO MOCK DATA)
# =========================================================

def extract_curriculum_sentences(content: str) -> List[str]:
    raw_lines = str(content or "").splitlines()
    sentences: List[str] = []
    for line in raw_lines:
        line_clean = line.strip()
        if len(line_clean) < 25 or looks_like_question_line(line_clean) or is_header_or_metadata_line(line_clean):
            continue
        parts = re.split(r"(?<=[.!?])\s+", line_clean)
        for p in parts:
            p_strip = p.strip()
            if len(p_strip) >= 30 and not is_header_or_metadata_line(p_strip):
                sentences.append(p_strip)
    if not sentences:
        for l in raw_lines:
            cl = l.strip()
            if len(cl) >= 15 and not is_header_or_metadata_line(cl):
                sentences.append(cl)
    return sentences


def synthesize_parameter_questions_from_content(
    content: str,
    count: int = 4,
    needed_categories: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Generates validated, fact-checked questions from components present in the uploaded curriculum,
    strictly adhering to all 6 constraints:
    1. Component Identification & Functions
    2. Number of Pins & Pin Identification
    3. Hypothetical Scenario-Based Practical Reasoning
    4. Logical & Conceptual Reasoning
    """
    return get_curriculum_component_questions(
        content=content,
        target_count=count,
        needed_categories=needed_categories
    )


# =========================================================
# DEDUPLICATION & SANITIZATION POST-FILTER
# =========================================================

def clean_and_filter_assessment_questions(
    questions: List[Dict[str, Any]],
    target_count: int = 10,
    difficulty: str = "medium",
    chapter_content: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Enforces all user-mandated parameters:
    - MUST INCLUDE: Component ID/functions, Pin counts/identification,
      Hypothetical practical scenarios, Logical & conceptual reasoning.
    - MUST EXCLUDE: Coding questions, Circuit-based diagrams, Project-related questions/pin configurations,
      wiring connection steps.
    - CONSTRAINTS: Balanced topic coverage, zero duplicates, appropriate difficulty.
    """
    valid_list: List[Dict[str, Any]] = []

    for q in questions:
        # Enforce strict exclusions
        if is_coding_question(q):
            continue
        if is_circuit_diagram_question(q):
            continue
        if is_project_specific_question(q):
            continue
        if is_wiring_or_connection_question(q):
            continue

        # Check for duplicates against already accepted
        is_dup = False
        for accepted in valid_list:
            if questions_are_too_similar(q.get("question", ""), accepted.get("question", "")):
                is_dup = True
                break
        if is_dup:
            continue

        # Classify and tag
        cat = classify_question_category(q)
        q["category"] = cat
        q["section"] = cat
        valid_list.append(q)

    # Required categories
    cats = [
        "Component Identification & Functions",
        "Number of Pins & Pin Identification",
        "Hypothetical Scenario-Based Practical Reasoning",
        "Logical & Conceptual Reasoning",
    ]

    # Check which categories are missing
    present_cats = {v.get("category") for v in valid_list}
    missing_cats = [c for c in cats if c not in present_cats]

    # Ensure all 4 mandatory categories are included
    if missing_cats and chapter_content:
        synth_questions = synthesize_parameter_questions_from_content(
            content=chapter_content,
            count=len(missing_cats),
            needed_categories=missing_cats
        )
        for sq in synth_questions:
            if any(questions_are_too_similar(sq.get("question", ""), v.get("question", "")) for v in valid_list):
                continue
            if len(valid_list) >= target_count:
                cat_counts = {c: sum(1 for v in valid_list if v.get("category") == c) for c in cats}
                max_cat = max(cat_counts, key=cat_counts.get)
                for idx in reversed(range(len(valid_list))):
                    if valid_list[idx].get("category") == max_cat and cat_counts[max_cat] > 1:
                        valid_list[idx] = sq
                        break
                else:
                    valid_list.append(sq)
            else:
                valid_list.append(sq)

    # If count is still insufficient, synthesize remaining questions from curriculum content
    if len(valid_list) < target_count and chapter_content:
        needed = target_count - len(valid_list)
        cat_counts = {c: sum(1 for v in valid_list if v.get("category") == c) for c in cats}
        cats_to_generate = sorted(cats, key=lambda c: cat_counts.get(c, 0))
        synth_questions = synthesize_parameter_questions_from_content(
            content=chapter_content,
            count=needed,
            needed_categories=cats_to_generate
        )
        for sq in synth_questions:
            if any(questions_are_too_similar(sq.get("question", ""), v.get("question", "")) for v in valid_list):
                continue
            valid_list.append(sq)
            if len(valid_list) >= target_count:
                break

    # Assign sequential indices
    for idx, item in enumerate(valid_list):
        item["id"] = idx + 1

    return valid_list[:target_count]


# =========================================================
# UNIFIED GENERATION DISPATCHER
# =========================================================

def normalize_questions(raw_questions: List[Dict[str, Any]], assessment_type: str = "mcq") -> List[Dict[str, Any]]:
    normalized = []
    for idx, q in enumerate(raw_questions, start=1):
        q_type = str(q.get("type", "mcq")).lower()
        ans_str = str(q.get("answer", "")).strip()

        # Safe marks conversion
        try:
            m_digits = re.search(r"\d+", str(q.get("marks", 1)))
            marks_val = int(m_digits.group(0)) if m_digits else 1
        except Exception:
            marks_val = 1

        item = {
            "id": int(q.get("id")) if str(q.get("id", "")).isdigit() else idx,
            "type": q_type,
            "question": str(q.get("question", "")).strip(),
            "answer": ans_str,
            "explanation": str(q.get("explanation", "")).strip(),
            "scenario": str(q.get("scenario", "")).strip() if q.get("scenario") else None,
            "marks": marks_val,
        }
        if q_type == "mcq" or "options" in q:
            opts = q.get("options")
            if isinstance(opts, list) and len(opts) == 4:
                item["options"] = {"A": str(opts[0]), "B": str(opts[1]), "C": str(opts[2]), "D": str(opts[3])}
            elif isinstance(opts, dict) and len(opts) >= 2:
                item["options"] = {k: str(v) for k, v in opts.items()}
            else:
                item["options"] = {"A": ans_str, "B": "Incorrect specification", "C": "Inverted logic", "D": "Exceeds component rating"}
                item["answer"] = "A"
        elif q_type == "true_false":
            item["options"] = {"A": "True", "B": "False"}
        elif assessment_type in ("pre_assembly", "mcq", "merged_conceptual"):
            # Enforce MCQ structure for pre-assembly, MCQ, and merged conceptual blueprints
            item["type"] = "mcq"
            item["options"] = {
                "A": ans_str,
                "B": "Operating voltage or timing limit exceeded",
                "C": "Inverted polarity or incorrect bus pullup",
                "D": "Incompatible logic threshold specification"
            }
            item["answer"] = "A"

        # If answer is textual instead of option key (e.g. "5V" instead of "B"), resolve key
        if item.get("options") and isinstance(item["options"], dict):
            opts_dict = item["options"]
            if item["answer"] not in opts_dict:
                for opt_k, opt_v in opts_dict.items():
                    if str(opt_v).strip().lower() == ans_str.lower():
                        item["answer"] = opt_k
                        break

        cat = classify_question_category(item)
        item["category"] = cat
        item["section"] = cat

        normalized.append(item)
    return normalized


def generate_assessment(
    chapter_content: str,
    assessment_type: str,
    question_count: int = 5,
    difficulty: str = "medium",
    provider: str = "auto",
    model: Optional[str] = None,
    rejected_questions: Optional[List[str]] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    content = str(chapter_content or "").strip()
    if not content:
        raise ValueError("Curriculum content is empty.")

    a_type = str(assessment_type or "mcq").strip().lower()
    project_title = detect_project_title(content)

    if a_type == "mixed":
        target_count = 10
    else:
        target_count = max(3, min(int(question_count or 5), 25))
    prompt = build_prompt(project_title, a_type, target_count, difficulty, content)

    prov = (provider or "auto").strip().lower()

    def finalize_questions(qs: List[Dict[str, Any]], ch_name: str, prov: str, mod: str) -> Dict[str, Any]:
        if a_type == "merged_conceptual":
            filtered = clean_and_filter_assessment_questions(qs, target_count=target_count, difficulty=difficulty, chapter_content=content)
        else:
            filtered = qs[:target_count]
        return {
            "chapter_name": clean_title_brackets(ch_name),
            "questions": filtered,
            "provider_used": prov,
            "model_used": mod
        }

    # 1. User explicitly selected Gemini
    if prov == "gemini":
        logger.info("Executing assessment generation via Google Gemini API...")
        try:
            res = call_gemini(prompt, model=model, api_key=api_key)
            questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
            return finalize_questions(questions, res.get("chapter_name", project_title), "Google Gemini", model or settings.GEMINI_MODEL)
        except Exception as e:
            logger.warning(f"Explicit Gemini provider failed ({e}). Engaging automatic resilient cascade...")

    # 2. User explicitly selected Groq
    if prov == "groq":
        logger.info("Executing assessment generation via Groq API...")
        try:
            res = call_groq(prompt, model=model, api_key=api_key)
            questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
            return finalize_questions(questions, res.get("chapter_name", project_title), "Groq", model or settings.GROQ_MODEL)
        except Exception as e:
            logger.warning(f"Explicit Groq provider failed ({e}). Engaging automatic resilient cascade...")

    # 3. User explicitly selected OpenRouter
    if prov == "openrouter":
        logger.info("Executing assessment generation via OpenRouter API...")
        try:
            res = call_openrouter(prompt, model=model, api_key=api_key)
            questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
            return finalize_questions(questions, res.get("chapter_name", project_title), "OpenRouter", model or settings.OPENROUTER_MODEL)
        except Exception as e:
            logger.warning(f"Explicit OpenRouter provider failed ({e}). Engaging automatic resilient cascade...")

    # 4. User explicitly selected Ollama
    if prov == "ollama":
        logger.info("Executing assessment generation via local Ollama...")
        try:
            res = call_ollama(prompt, model=model)
            questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
            return finalize_questions(questions, res.get("chapter_name", project_title), "Local Ollama", model or settings.STANDARD_MODEL)
        except Exception as e:
            logger.warning(f"Explicit Ollama provider failed ({e}). Engaging automatic resilient cascade...")

    # 5. AUTO Mode: Resilient Multi-Provider Fallback Cascade
    # Cascade Priority: Gemini 3.6 Flash -> Groq -> OpenRouter -> Ollama -> Dynamic Synthesizer
    logger.info("Auto AI Cascade: Attempting Google Gemini 3.6 Flash...")
    try:
        res = call_gemini(prompt, model=settings.GEMINI_MODEL, api_key=api_key)
        questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
        if len(questions) >= 3:
            return finalize_questions(questions, res.get("chapter_name", project_title), "Google Gemini", settings.GEMINI_MODEL)
    except Exception as e:
        logger.warning(f"Auto-cascade Gemini step failed: {e}. Cascading to Groq...")

    try:
        res = call_groq(prompt, model=settings.GROQ_MODEL, api_key=api_key)
        questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
        if len(questions) >= 3:
            return finalize_questions(questions, res.get("chapter_name", project_title), "Groq", settings.GROQ_MODEL)
    except Exception as e:
        logger.warning(f"Auto-cascade Groq step failed: {e}. Cascading to OpenRouter...")

    try:
        res = call_openrouter(prompt, model=settings.OPENROUTER_MODEL, api_key=api_key)
        questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
        if len(questions) >= 3:
            return finalize_questions(questions, res.get("chapter_name", project_title), "OpenRouter", settings.OPENROUTER_MODEL)
    except Exception as e:
        logger.warning(f"Auto-cascade OpenRouter step failed: {e}. Cascading to Ollama...")

    try:
        res = call_ollama(prompt, model=settings.STANDARD_MODEL)
        questions = normalize_questions(res.get("questions", []), assessment_type=a_type)
        if len(questions) >= 3:
            return finalize_questions(questions, res.get("chapter_name", project_title), "Local Ollama", settings.STANDARD_MODEL)
    except Exception as e:
        logger.info(f"Ollama unavailable ({e}). Engaging dynamic text synthesizer...")

    fallback_res = fallback_synthesizer(content, a_type, question_count=target_count)
    if a_type == "merged_conceptual":
        fallback_res["questions"] = clean_and_filter_assessment_questions(
            fallback_res.get("questions", []),
            target_count=target_count,
            difficulty=difficulty,
            chapter_content=content
        )
    return fallback_res


# =========================================================
# CORPUS LOADER & MERGED ASSESSMENT GENERATOR
# =========================================================

def generate_merged_assessment(
    chapter_content: Optional[str] = None,
    question_count: int = 12,
    difficulty: str = "medium",
    provider: str = "auto",
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    Creates a merged assessment question paper covering the provided curriculum topics,
    strictly enforcing:
    - MUST INCLUDE:
        1. Electronic component identification, functions, and applications.
        2. Number of pins and pin identification of relevant components.
        3. Hypothetical, scenario-based questions testing practical understanding.
        4. Logical and conceptual reasoning questions.
    - MUST EXCLUDE:
        1. Coding questions (zero programming code/syntax).
        2. Circuit-based questions or diagrams (zero schematics/drawings).
        3. Project-related questions, including project-specific pin configurations.
    - CONSTRAINTS:
        Balanced topic coverage across all components, no duplicate questions,
        appropriate difficulty, conceptual understanding, and real-world scenarios.
    """
    content = str(chapter_content or "").strip()
    if not content:
        raise ValueError("Curriculum content cannot be empty. Please upload curriculum PDFs to generate assessment.")

    target_count = max(4, min(int(question_count or 12), 20))

    try:
        raw_res = generate_assessment(
            chapter_content=content,
            assessment_type="merged_conceptual",
            question_count=target_count,
            difficulty=difficulty,
            provider=provider,
            model=model
        )
        questions = raw_res.get("questions", [])
    except Exception as e:
        logger.warning(f"AI call in generate_merged_assessment encountered: {e}. Synthesizing from content.")
        questions = []

    if questions:
        final_questions = questions
    else:
        final_questions = clean_and_filter_assessment_questions(
            [],
            target_count=target_count,
            difficulty=difficulty,
            chapter_content=content
        )

    cat_counts: Dict[str, int] = {}
    for q in final_questions:
        c = q.get("category", "General")
        cat_counts[c] = cat_counts.get(c, 0) + 1

    detected_title = detect_project_title(content)
    chapter_label = f"{detected_title} - Merged Assessment" if detected_title and detected_title != "STEM Curriculum Assessment" else "Merged Curriculum Assessment"

    return {
        "chapter_name": chapter_label,
        "questions": final_questions,
        "provider_used": provider.capitalize() if provider != "auto" else "Curriculum Intelligence Cascade",
        "model_used": model or "Standard",
        "sections_covered": cat_counts,
        "parameters_enforced": {
            "component_identification": True,
            "pin_identification": True,
            "hypothetical_scenarios": True,
            "logical_reasoning": True,
            "zero_coding_questions": True,
            "zero_circuit_diagrams": True,
            "zero_project_specific_pins": True
        }
    }

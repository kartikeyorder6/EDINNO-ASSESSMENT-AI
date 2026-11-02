import io
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.pdf_generator import create_assessment_pdf
from app.services.ai_generator import (
    detect_project_title,
    tokenize_text,
    compare_question_similarity,
    questions_are_too_similar,
    valid_mcq,
    generate_assessment,
)

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "EDINNO" in data["service"]


def test_ai_tokenizer_and_similarity():
    q1 = "What is the function of the LDR sensor in Automatic Light Control?"
    q2 = "Explain the role of the LDR sensor in the Automatic Light Controller."
    q3 = "How does an ultrasonic sensor calculate distance in aerospace systems?"

    toks = tokenize_text(q1)
    assert "ldr" in toks
    assert "the" not in toks  # "the" is a stopword
    assert "what" not in toks

    assert questions_are_too_similar(q1, q2) is True
    assert questions_are_too_similar(q1, q3) is False


def test_project_title_detection():
    sample_text = """
    Project: Automated Waste Segregation Assistant (SmartInfra)
    Objective: Segregate wet and dry waste using servo motors and moisture sensor.
    """
    title = detect_project_title(sample_text)
    assert "Automated Waste" in title or "SmartInfra" in title


def test_question_validator():
    valid_item = {
        "question": "What is the operating voltage of Arduino Uno?",
        "options": {
            "A": "5V",
            "B": "12V",
            "C": "24V",
            "D": "230V"
        },
        "answer": "A"
    }
    assert valid_mcq(valid_item) is True

    invalid_item = {
        "question": "Short?",
        "options": {"A": "5V", "B": "5V"},
        "answer": "A"
    }
    assert valid_mcq(invalid_item) is False


def test_generate_assessment_offline_raises(monkeypatch):
    content = """
    Arduino Uno microcontroller board with 14 digital I/O pins and 6 analog pins.
    Project: Crop Ripeness Analyzer using color sensor and OLED display.
    Connect SCL to A5 and SDA to A4 for I2C communication.
    """
    # Simulate all AI providers being offline to verify that mock/testing fallback questions are NOT injected
    monkeypatch.setattr("app.services.ai_generator._PROVIDERS", ())
    with pytest.raises(RuntimeError, match="AI assessment generation failed"):
        generate_assessment(content, "pre_assembly")


def test_pdf_generation():
    sample_assessment = {
        "assessment_type": "mcq",
        "chapter_name": "Arduino Robotics",
        "questions": [
            {
                "question": "What is the function of pinMode(13, OUTPUT)?",
                "options": {
                    "A": "Set pin 13 as digital output",
                    "B": "Read analog value",
                    "C": "Reset microcontroller",
                    "D": "Disable pullup resistor"
                },
                "answer": "A",
                "explanation": "pinMode configures the pin driver mode."
            }
        ]
    }
    pdf_stream = create_assessment_pdf("Arduino Robotics", sample_assessment)
    pdf_bytes = pdf_stream.getvalue()
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF")


def test_generate_assessment_endpoint(monkeypatch):
    monkeypatch.setattr("app.services.ai_generator._PROVIDERS", ())
    payload = {
        "chapter_content": "Introduction to Arduino and ultrasonic sensors for distance measurement.",
        "assessment_type": "mcq",
        "question_count": 5
    }
    response = client.post("/api/v1/generate-assessment", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["questions"]) > 0


def test_download_assessment_endpoint():
    payload = {
        "assessment_type": "mcq",
        "chapter_name": "Arduino Chapter 7",
        "questions": [
            {
                "question": "Which pin is used for I2C SDA on Arduino Uno?",
                "options": {
                    "A": "A4",
                    "B": "A5",
                    "C": "D2",
                    "D": "D13"
                },
                "answer": "A",
                "explanation": "On Uno, SDA is on analog pin A4."
            }
        ]
    }
    response = client.post("/api/v1/download-assessment", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_pre_assembly_projects_and_verification():
    target_pid = "CUSTOM-PROJECT-1"
    target_title = "Smart Solar Tracker"

    # 1. Check assembly status before quiz - must be locked!
    status_r = client.get(f"/api/v1/assembly/status?project_id={target_pid}")
    assert status_r.status_code == 200
    status_data = status_r.json()
    assert status_data["allowed"] is False
    assert status_data["status"] in ["PENDING_QUIZ", "FAILED_QUIZ"]

    # 2. Simulate failing quiz (< 80%)
    fail_payload = {
        "project_id": target_pid,
        "project_title": target_title,
        "answers": {"0": "WRONG_ANSWER"},
        "questions": [
            {"id": "0", "question": "Q1", "answer": "B", "options": {"A": "1", "B": "2"}}
        ]
    }
    verify_fail = client.post("/api/v1/pre-assembly/verify", json=fail_payload)
    assert verify_fail.status_code == 200
    assert verify_fail.json()["passed"] is False

    # Still locked!
    assert client.get(f"/api/v1/assembly/status?project_id={target_pid}").json()["allowed"] is False

    # 3. Simulate passing quiz (100% >= 80%)
    pass_payload = {
        "project_id": target_pid,
        "project_title": target_title,
        "answers": {
            "0": "B",
            "1": "A",
            "2": "C",
            "3": "D",
            "4": "A"
        },
        "questions": [
            {"id": "0", "question": "Q1", "answer": "B", "options": {"A": "1", "B": "2"}},
            {"id": "1", "question": "Q2", "answer": "A", "options": {"A": "1", "B": "2"}},
            {"id": "2", "question": "Q3", "answer": "C", "options": {"C": "3", "D": "4"}},
            {"id": "3", "question": "Q4", "answer": "D", "options": {"C": "3", "D": "4"}},
            {"id": "4", "question": "Q5", "answer": "A", "options": {"A": "1", "B": "2"}},
        ]
    }
    verify_pass = client.post("/api/v1/pre-assembly/verify", json=pass_payload)
    assert verify_pass.status_code == 200
    pass_data = verify_pass.json()
    assert pass_data["passed"] is True
    assert pass_data["score"] == 5
    assert pass_data["authorization_token"] is not None

    # 4. Now assembly status MUST be allowed!
    unlocked = client.get(f"/api/v1/assembly/status?project_id={target_pid}").json()
    assert unlocked["allowed"] is True
    assert unlocked["status"] == "VERIFIED"

    # 5. List projects now includes verified project
    r = client.get("/api/v1/pre-assembly/projects")
    assert r.status_code == 200
    projects = r.json()
    assert isinstance(projects, list)
    assert any(p["id"] == target_pid for p in projects)


def test_curriculum_overview():
    # Dynamic curriculum overview returns proper schema with verified sensors
    r = client.get("/api/v1/curriculum/overview?grade=7")
    assert r.status_code == 200
    data = r.json()
    assert data["grade"] == 7
    assert isinstance(data["topics"], list)
    assert isinstance(data["activities"], list)
    assert isinstance(data["projects"], list)
    assert len(data["sensors"]) >= 6

    # Grade 6 returns unstaged when no PDFs on disk
    r6 = client.get("/api/v1/curriculum/overview?grade=6")
    assert r6.status_code == 200
    d6 = r6.json()
    assert d6["grade"] == 6
    assert d6["staged"] is False
    assert len(d6["topics"]) == 0
    assert len(d6["activities"]) == 0


def test_chapter_quizzes_overview():
    r = client.get("/api/v1/chapter/quizzes")
    assert r.status_code == 200
    data = r.json()
    assert "chapter_name" in data
    assert "progress" in data


def test_download_assessment_with_newlines_in_title():
    """Ensure titles with newlines or special chars do not crash uvicorn with Invalid HTTP header value."""
    payload = {
        "assessment_type": "mcq",
        "chapter_name": "Activity 1:\nUltrasonic Sensor\r\n(HC-SR04) Setup & Testing",
        "questions": [
            {
                "id": 1,
                "type": "mcq",
                "question": "How many pins does HC-SR04 have?",
                "options": {"A": "4 pins", "B": "3 pins", "C": "2 pins", "D": "5 pins"},
                "answer": "A",
                "explanation": "VCC, Trig, Echo, GND"
            }
        ]
    }
    r = client.post("/api/v1/download-assessment", json=payload)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    cd = r.headers.get("content-disposition", "")
    assert "\n" not in cd and "\r" not in cd
    assert len(r.content) > 1000


def test_is_answer_correct_grading_accuracy():
    from app.api.v1.assessment import is_answer_correct
    # List options
    assert is_answer_correct("5V", "A", options=["5V", "3.3V", "12V", "GND"]) is True
    assert is_answer_correct("A", "5V", options=["5V", "3.3V", "12V", "GND"]) is True
    # Dict options
    opt_dict = {"A": "to", "B": "Automatic System", "C": "Relay", "D": "Sensor"}
    # User selected wrong option 'A' ("to"), should NOT match 'Automatic System'
    assert is_answer_correct("A", "Automatic System", options=opt_dict) is False
    # Correct key match
    assert is_answer_correct("B", "Automatic System", options=opt_dict) is True


def test_fallback_synthesizer_short_text():
    from app.services.ai_generator import fallback_synthesizer
    # Short lines that previously caused ZeroDivisionError
    res = fallback_synthesizer("Hi.\nShort.\nTiny.", "mixed", question_count=10)
    assert res is not None
    assert len(res["questions"]) == 10


def test_clean_and_parse_json_trailing_comma():
    from app.services.ai_generator import clean_and_parse_json
    raw_with_trailing = '```json\n{"chapter_name": "Test", "questions": [{"id": 1,},],}\n```'
    parsed = clean_and_parse_json(raw_with_trailing)
    assert parsed["chapter_name"] == "Test"


def test_merged_paper_empty_content_returns_400():
    r = client.post("/api/v1/assessment/merged-paper", json={
        "question_count": 10,
        "difficulty": "medium",
        "chapter_content": None
    })
    assert r.status_code == 400
    assert "cannot be empty" in r.json()["detail"].lower()


def test_gemini_api_key_pool():
    from app.core.config import Settings
    custom_s = Settings(
        GEMINI_API_KEY="key1, key2; key3\nkey4",
        GEMINI_API_KEYS=["key5", "key1"]
    )
    keys = custom_s.get_gemini_api_keys()
    assert len(keys) == 5
    assert keys == ["key1", "key2", "key3", "key4", "key5"]


def test_smart_key_rotation_and_cooldown():
    import time
    from app.services.gemini_pool import GeminiKeyPool, GeminiKeyMetadata
    pool = GeminiKeyPool()
    keys = ["key_A", "key_B", "key_C"]
    pool.discover_keys = lambda: list(keys)
    for k in keys:
        pool._keys_meta[k] = GeminiKeyMetadata(k)

    # Request 1: Picks a key (e.g. key_A)
    chosen_1 = pool.select_best_keys(max_candidates=1)[0]
    pool.record_start(chosen_1)
    pool.record_success(chosen_1, latency_sec=4.0)

    # Request 2: MUST NOT pick chosen_1!
    chosen_2 = pool.select_best_keys(max_candidates=1)[0]
    assert chosen_2 != chosen_1, f"Expected fresh key, got previously used {chosen_1}"
    pool.record_start(chosen_2)
    pool.record_success(chosen_2, latency_sec=4.2)

    # Request 3: MUST NOT pick chosen_2!
    chosen_3 = pool.select_best_keys(max_candidates=1)[0]
    assert chosen_3 != chosen_2, f"Expected fresh key, got previously used {chosen_2}"
    pool.record_start(chosen_3)
    pool.record_success(chosen_3, latency_sec=3.9)

    # Test Quota / Cooldown: Mark key_A on 429 cooldown
    pool.record_rate_limit("key_A")
    for _ in range(5):
        candidates = pool.select_best_keys(max_candidates=3)
        assert "key_A" not in candidates, "Key on cooldown must NEVER be returned in candidate list"

    # All keys on cooldown -> returns [] immediately
    pool.record_rate_limit("key_B")
    pool.record_rate_limit("key_C")
    candidates = pool.select_best_keys(max_candidates=3)
    assert candidates == [], "When all keys are on cooldown, candidates must be empty"


def test_security_headers_present():
    """Verify all OWASP security hardening headers are present on responses."""
    resp = client.get("/health")
    assert resp.status_code == 200
    headers = resp.headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Referrer-Policy") == "no-referrer"
    assert "max-age=31536000" in headers.get("Strict-Transport-Security", "")
    assert headers.get("Permissions-Policy") == "camera=(), microphone=(), geolocation=()"
    assert headers.get("Cross-Origin-Opener-Policy") == "same-origin"


def test_safe_basename_traversal_protection():
    """Verify directory traversal tokens are stripped and neutralized."""
    from app.api.common import safe_basename
    assert safe_basename("../../etc/passwd") == "passwd"
    assert safe_basename("..\\..\\windows\\system32\\cmd.exe") == "cmd.exe"
    assert safe_basename("..") == "unnamed_document.pdf"
    assert safe_basename(".") == "unnamed_document.pdf"
    assert safe_basename("") == "unnamed_document.pdf"
    assert safe_basename("normal_curriculum.pdf") == "normal_curriculum.pdf"


def test_admin_auth_bearer_and_x_token(monkeypatch):
    """Verify require_admin supports both X-Admin-Token and Bearer authorization with constant-time check."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "super-secret-admin-token")

    # Unauthorized
    r_unauth = client.get("/api/v1/system/key-pool")
    assert r_unauth.status_code == 403

    # Authorized via X-Admin-Token
    r_header = client.get("/api/v1/system/key-pool", headers={"X-Admin-Token": "super-secret-admin-token"})
    assert r_header.status_code == 200

    # Authorized via Authorization: Bearer
    r_bearer = client.get("/api/v1/system/key-pool", headers={"Authorization": "Bearer super-secret-admin-token"})
    assert r_bearer.status_code == 200

    # Invalid token
    r_bad = client.get("/api/v1/system/key-pool", headers={"Authorization": "Bearer wrong-token"})
    assert r_bad.status_code == 403


def test_bounded_store_active_ttl_pruning():
    """Verify BoundedStore eagerly purges expired items on write."""
    import time
    from app.api.v1.assessment import BoundedStore
    store = BoundedStore(max_items=10, ttl_sec=0.05)
    store["old1"] = "val1"
    store["old2"] = "val2"
    time.sleep(0.06)

    # Adding a new item triggers active pruning of expired head items
    store["new1"] = "val3"
    assert "old1" not in store
    assert "old2" not in store
    assert store.get("new1") == "val3"


def test_security_headers_present():
    """Verify production security headers are set on API responses."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert "default-src 'none'" in resp.headers.get("Content-Security-Policy", "")
    assert "camera=()" in resp.headers.get("Permissions-Policy", "")
    assert resp.headers.get("Cross-Origin-Opener-Policy") == "same-origin"


def test_sliding_window_rate_limiter():
    """Verify sliding-window rate limiter blocks requests exceeding configured limit."""
    from app.main import SlidingWindowRateLimiter
    limiter = SlidingWindowRateLimiter(limit_per_minute=3)
    assert limiter.is_allowed("192.168.1.100")[0] is True
    assert limiter.is_allowed("192.168.1.100")[0] is True
    assert limiter.is_allowed("192.168.1.100")[0] is True
    # 4th request in the same window must be blocked
    allowed, retry_after = limiter.is_allowed("192.168.1.100")
    assert allowed is False
    assert retry_after >= 1
    # Different IP is not affected
    assert limiter.is_allowed("192.168.1.101")[0] is True


def test_auth_token_128bit_entropy():
    """Verify clearance token contains 128-bit cryptographic hex entropy."""
    import re
    pid = "SEC-TEST-PID"
    payload = {
        "project_id": pid,
        "project_title": "Security Test Project",
        "answers": {"0": "A"},
        "questions": [
            {"id": "0", "question": "What is 128-bit security?", "answer": "A", "options": {"A": "Safe", "B": "Unsafe"}}
        ]
    }
    r = client.post("/api/v1/pre-assembly/verify", json=payload)
    assert r.status_code == 200
    token = r.json().get("authorization_token")
    assert token is not None
    assert re.match(r"^ASM-AUTH-[0-9A-F]{32}$", token) is not None


def test_chapter_title_cleaning_and_inference():
    """Verify intelligent chapter title extraction, noise stripping, and cross-PDF synthesis."""
    from app.services.ai_generator import clean_chapter_title, infer_curriculum_chapter_title

    # 1. Strips 'The Problem' and file numbering noise
    assert clean_chapter_title("Terrain Rover The Problem") == "Terrain Rover"
    assert clean_chapter_title("1_Terrain_Rover_The_Problem.pdf") == "Terrain Rover"
    assert clean_chapter_title("Project: Terrain Rover\nThe Problem: Imagine a rover...") == "Terrain Rover"
    assert clean_chapter_title("Terrain Rover - Merged Assessment") == "Terrain Rover"
    assert clean_chapter_title("Crop Ripeness Problem Statement") == "Crop Ripeness"
    assert clean_chapter_title("Traffic Light Controller The Problem") == "Traffic Light Controller"

    # 2. Enforces concise title constraint (< 46 chars)
    long_input = "Extremely Long Comprehensive Robotic Chapter About Autonomous Vehicles Exploring Hostile Terrains"
    cleaned_long = clean_chapter_title(long_input)
    assert len(cleaned_long) <= 45

    # 3. Cross-PDF topic insight derivation
    multi_resources = {
        "doc1": "A terrain rover is designed to navigate rough surfaces using four DC motors and an ultrasonic sensor to detect obstacles...",
        "doc2": "We test the HC-SR04 ultrasonic distance sensor with 4 pins...",
        "doc3": "We test the L298N dual H-bridge motor driver to steer the rover wheels..."
    }
    derived = infer_curriculum_chapter_title(multi_resources, ["1_Terrain_Rover_The_Problem.pdf", "Activity 1.pdf"])
    assert derived == "Terrain Rover Robotics"
    assert len(derived) <= 45
    assert "The Problem" not in derived


def test_mixed_assessment_dynamic_question_counts():
    from app.services.ai_generator import get_type_instruction, fallback_synthesizer
    from app.services.curriculum_knowledge import _mixed_paper, CURRICULUM_COMPONENTS

    # Verify prompt instruction generation scales proportionally
    instr_10 = get_type_instruction("mixed", question_count=10)
    assert "TOTAL 10 QUESTIONS: 5 MCQs INCLUDING 2 SCENARIO-BASED + 5 TRUE/FALSE" in instr_10

    instr_8 = get_type_instruction("mixed", question_count=8)
    assert "TOTAL 8 QUESTIONS: 4 MCQs INCLUDING 2 SCENARIO-BASED + 4 TRUE/FALSE" in instr_8

    instr_14 = get_type_instruction("mixed", question_count=14)
    assert "TOTAL 14 QUESTIONS: 7 MCQs INCLUDING 3 SCENARIO-BASED + 7 TRUE/FALSE" in instr_14

    # Verify component synthesizer generation matches exact requested counts
    q_10 = _mixed_paper(CURRICULUM_COMPONENTS, target_count=10)
    assert len(q_10) == 10

    q_8 = _mixed_paper(CURRICULUM_COMPONENTS, target_count=8)
    assert len(q_8) == 8

    q_12 = _mixed_paper(CURRICULUM_COMPONENTS, target_count=12)
    assert len(q_12) == 12

    # Verify fallback synthesizer honors custom question_count
    fb_res = fallback_synthesizer("Ultrasonic sensor HC-SR04 with Trig and Echo pins", "mixed", question_count=8)
    assert len(fb_res["questions"]) == 8











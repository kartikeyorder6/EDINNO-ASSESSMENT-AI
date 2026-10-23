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


def test_generate_assessment_fallback():
    content = """
    Arduino Uno microcontroller board with 14 digital I/O pins and 6 analog pins.
    Project: Crop Ripeness Analyzer using color sensor and OLED display.
    Connect SCL to A5 and SDA to A4 for I2C communication.
    """
    res = generate_assessment(content, "pre_assembly")
    assert res is not None
    assert "questions" in res
    assert len(res["questions"]) == 5
    for q in res["questions"]:
        assert "question" in q
        assert "options" in q
        assert "answer" in q


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


def test_generate_assessment_endpoint():
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


def test_chapter_quizzes_overview():
    r = client.get("/api/v1/chapter/quizzes")
    assert r.status_code == 200
    data = r.json()
    assert "chapter_name" in data
    assert "progress" in data



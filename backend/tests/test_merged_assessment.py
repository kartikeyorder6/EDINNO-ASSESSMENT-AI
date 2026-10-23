import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.ai_generator import (
    generate_merged_assessment,
    is_coding_question,
    is_circuit_diagram_question,
    is_project_specific_question,
    classify_question_category,
    clean_and_filter_assessment_questions,
)
from app.services.pdf_generator import create_assessment_pdf

client = TestClient(app)

SAMPLE_CURRICULUM = """
Arduino Uno microcontroller board features an ATmega328P processor, 14 digital I/O pins, and 6 analog inputs.
HC-SR04 ultrasonic distance sensor operates using 4 pins: VCC, Trig, Echo, and GND, measuring distance using 40kHz acoustic echo.
DHT11 temperature and humidity sensor has 4 pins: VCC, DATA, NC, and GND, requiring a 5k-10k pull-up resistor on the data line.
SG90 micro servo motor uses a 3-wire cable: Brown (GND), Red (5V), and Orange (PWM control signal).
Passive Infrared (PIR) sensor detects dynamic changes in thermal infrared radiation from moving warm bodies.
Relay module provides electrical isolation between 5V microcontroller signals and high voltage mains power.
An LED requires a current-limiting resistor in series to prevent excessive current from burning out the diode.
In practical deployment, inductive loads require flyback diodes to clamp reverse high-voltage EMF spikes.
"""


def test_question_validators_enforcement():
    """Verify strict exclusion validators for code, circuit diagrams, and project-specific trivia."""
    # Coding questions must be flagged
    q_code = {
        "question": "What is the output of void loop() { digitalWrite(13, HIGH); delay(1000); }?",
        "options": {"A": "LED turns ON", "B": "Nothing", "C": "Error", "D": "Blinks"},
        "answer": "A"
    }
    assert is_coding_question(q_code) is True

    # Circuit diagram questions must be flagged
    q_circuit = {
        "question": "In the circuit diagram below, what is the connection of pin 3?",
        "options": {"A": "VCC", "B": "GND", "C": "Output", "D": "Analog"},
        "answer": "A"
    }
    assert is_circuit_diagram_question(q_circuit) is True

    # Project-specific trivia must be flagged
    q_project = {
        "question": "In Project 3 Emergency Braking System, which pin was connected to the buzzer?",
        "options": {"A": "Pin 4", "B": "Pin 7", "C": "Pin 11", "D": "Pin 2"},
        "answer": "A"
    }
    assert is_project_specific_question(q_project) is True

    # Valid conceptual question must pass all exclusions
    q_valid = {
        "question": "How many pins does an HC-SR04 ultrasonic distance sensor have, and what are their functions?",
        "options": {
            "A": "4 pins: VCC, Trig, Echo, GND",
            "B": "3 pins: VCC, Signal, GND",
            "C": "2 pins: Anode, Cathode",
            "D": "5 pins: VCC, Trig, Echo, Out, GND"
        },
        "answer": "A",
        "explanation": "HC-SR04 has 4 designated pins: VCC (+5V), Trig, Echo, and GND."
    }
    assert is_coding_question(q_valid) is False
    assert is_circuit_diagram_question(q_valid) is False
    assert is_project_specific_question(q_valid) is False


def test_classify_question_category():
    """Verify categorization into the 4 mandatory parameter categories."""
    q_pin = {"question": "How many pins does a DHT11 sensor package possess and what are their pin roles?"}
    assert classify_question_category(q_pin) == "Number of Pins & Pin Identification"

    q_scenario = {
        "scenario": "An automated guided cart equipped with HC-SR04 collides with a velvet curtain.",
        "question": "What is the primary physical cause of this collision failure?"
    }
    assert classify_question_category(q_scenario) == "Hypothetical Scenario-Based Practical Reasoning"

    q_logic = {"question": "Why is a current-limiting resistor strictly required when connecting an LED across 5V?"}
    assert classify_question_category(q_logic) == "Logical & Conceptual Reasoning"

    q_comp = {"question": "Which electronic component functions as the primary microcontroller on an Arduino Uno?"}
    assert classify_question_category(q_comp) == "Component Identification & Functions"


def test_generate_merged_assessment_core():
    """Test generating a merged assessment paper ensuring all inclusions and exclusions hold."""
    res = generate_merged_assessment(
        chapter_content=SAMPLE_CURRICULUM,
        question_count=12,
        difficulty="medium",
        provider="auto"
    )

    assert "questions" in res
    questions = res["questions"]
    assert len(questions) >= 8

    # 1. Parameter: MUST EXCLUDE
    for q in questions:
        assert is_coding_question(q) is False, f"Coding question leaked: {q['question']}"
        assert is_circuit_diagram_question(q) is False, f"Circuit diagram question leaked: {q['question']}"
        assert is_project_specific_question(q) is False, f"Project-specific trivia leaked: {q['question']}"

    # 2. Parameter: MUST INCLUDE (all 4 categories present)
    categories = {q.get("category") for q in questions}
    assert "Component Identification & Functions" in categories
    assert "Number of Pins & Pin Identification" in categories
    assert "Hypothetical Scenario-Based Practical Reasoning" in categories
    assert "Logical & Conceptual Reasoning" in categories

    # 3. Parameter: Balanced topic coverage
    covered = res.get("sections_covered", {})
    for cat_name in [
        "Component Identification & Functions",
        "Number of Pins & Pin Identification",
        "Hypothetical Scenario-Based Practical Reasoning",
        "Logical & Conceptual Reasoning",
    ]:
        assert covered.get(cat_name, 0) >= 1

    # 4. Parameter: Parameter enforcement flags
    enforced = res.get("parameters_enforced", {})
    assert enforced.get("zero_coding_questions") is True
    assert enforced.get("zero_circuit_diagrams") is True
    assert enforced.get("zero_project_specific_pins") is True


def test_merged_paper_endpoints():
    """Test POST /api/v1/assessment/merged-paper with user curriculum content."""
    resp = client.post("/api/v1/assessment/merged-paper", json={
        "chapter_content": SAMPLE_CURRICULUM,
        "question_count": 10,
        "difficulty": "medium",
        "provider": "auto"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["assessment_type"] == "merged_conceptual"
    assert len(data["questions"]) >= 8

    # Verify zero coding, zero diagrams, zero project trivia
    for q in data["questions"]:
        assert is_coding_question(q) is False
        assert is_circuit_diagram_question(q) is False
        assert is_project_specific_question(q) is False


def test_merged_pdf_export():
    """Test generating A4 PDF for merged conceptual assessment."""
    res = generate_merged_assessment(
        chapter_content=SAMPLE_CURRICULUM,
        question_count=8,
        difficulty="medium",
        provider="auto"
    )
    pdf_bytes = create_assessment_pdf("Curriculum: Merged Assessment", res)
    assert pdf_bytes is not None
    assert len(pdf_bytes.getvalue()) > 5000

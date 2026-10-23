import pytest
from app.services.curriculum_knowledge import get_curriculum_component_questions
from app.services.ai_generator import (
    is_coding_question,
    is_circuit_diagram_question,
    is_project_specific_question,
    is_wiring_or_connection_question,
    questions_are_too_similar,
)

SAMPLE_CURRICULUM = """
Arduino Uno development board with ATmega328P microcontroller, 14 digital I/O pins, and 6 analog input pins.
HC-SR04 ultrasonic sensor with 4 pins: VCC, Trig, Echo, and GND, measuring distance using 40kHz sound reflections.
DHT11 temperature and humidity sensor with 4 pins: VCC, Data, NC, and GND.
Light Dependent Resistor (LDR) with 2 pins, decreasing resistance as ambient light increases.
PIR motion sensor with 3 pins: VCC, OUT, GND, detecting infrared radiation from warm bodies.
SSD1306 0.96 inch OLED display with 4 pins: VCC, GND, SCL, SDA, operating over I2C.
SG90 micro servo motor with 3 wires: PWM signal, VCC, GND.
5V single-channel relay module with 3 control pins: VCC, GND, IN.
Piezo buzzer with 2 pins for acoustic tone generation.
LED with 2 pins: Anode and Cathode, requiring a current-limiting resistor.
"""

def test_curriculum_knowledge_all_constraints():
    """Verify that all questions generated from the knowledge bank strictly obey all 6 constraints."""
    questions = get_curriculum_component_questions(SAMPLE_CURRICULUM, target_count=12)
    assert len(questions) == 12

    # Check for duplicates across the entire set
    for i in range(len(questions)):
        for j in range(i + 1, len(questions)):
            assert not questions_are_too_similar(questions[i]["question"], questions[j]["question"]), (
                f"Duplicate detected between Q{i+1} and Q{j+1}: '{questions[i]['question']}' vs '{questions[j]['question']}'"
            )

    pin_count_found = False
    functionality_found = False
    scenario_found = False

    for idx, q in enumerate(questions, 1):
        # 1. No project names
        assert not is_project_specific_question(q), f"Q{idx} violated Constraint 1 (Project details): {q['question']}"

        # 2. No pin connections / wiring steps
        assert not is_wiring_or_connection_question(q), f"Q{idx} violated Constraint 2 (Pin connections): {q['question']}"
        assert not is_circuit_diagram_question(q), f"Q{idx} referenced circuit diagrams: {q['question']}"
        assert not is_coding_question(q), f"Q{idx} contained code: {q['question']}"

        # 3. Component pin-count questions allowed
        if q.get("category") == "Number of Pins & Pin Identification":
            pin_count_found = True
            assert any(word in q["question"].lower() for word in ["pin", "pins", "terminal", "leads", "wires"]), (
                f"Q{idx} categorized as pin count but does not mention pins: {q['question']}"
            )

        # 4. Component functionality & scenarios allowed
        if q.get("category") == "Component Identification & Functions":
            functionality_found = True
        if q.get("category") == "Hypothetical Scenario-Based Practical Reasoning":
            scenario_found = True

        # 5. Answer-option accuracy: 4 distinct options, valid answer key, explicit answer
        options = q.get("options", {})
        assert isinstance(options, dict), f"Q{idx} options must be a dict"
        assert len(options) == 4, f"Q{idx} must have exactly 4 options, got {len(options)}"
        assert set(options.keys()) == {"A", "B", "C", "D"}, f"Q{idx} option keys must be A, B, C, D"

        ans = q.get("answer")
        assert ans in {"A", "B", "C", "D"}, f"Q{idx} answer must be A, B, C, or D, got '{ans}'"
        correct_text = options[ans]
        assert len(str(correct_text).strip()) > 0, f"Q{idx} correct answer text cannot be empty"

        # 6. Logical validation: all options non-empty and unique
        opt_values = [str(v).strip() for v in options.values()]
        assert all(len(v) > 0 for v in opt_values), f"Q{idx} has empty option text"
        assert len(set(opt_values)) == 4, f"Q{idx} has duplicate option values: {opt_values}"

    assert pin_count_found, "Must include at least one component pin-count question"
    assert functionality_found, "Must include at least one component functionality question"
    assert scenario_found, "Must include at least one hypothetical scenario question"


def test_comprehensive_mixed_exam_structure():
    """Verify that Comprehensive Mixed Exam generates exactly 5 MCQs (incl. 2 scenarios) + 5 True/False questions."""
    from app.services.ai_generator import generate_assessment

    res = generate_assessment(
        SAMPLE_CURRICULUM,
        assessment_type="mixed",
        question_count=10,
        provider="auto"
    )

    questions = res["questions"]
    assert len(questions) == 10, f"Expected 10 questions, got {len(questions)}"

    mcqs = [q for q in questions if q.get("type") == "mcq"]
    scenarios = [q for q in questions if q.get("type") == "mcq" and q.get("scenario")]
    tfs = [q for q in questions if q.get("type") == "true_false"]

    assert len(mcqs) == 5, f"Expected 5 MCQs, got {len(mcqs)}"
    assert len(scenarios) == 2, f"Expected exactly 2 scenario-based MCQs, got {len(scenarios)}"
    assert len(tfs) == 5, f"Expected 5 True/False questions, got {len(tfs)}"

    # Check True/False options and answers
    for idx, tf in enumerate(tfs, start=6):
        opts = tf.get("options", {})
        assert opts == {"A": "True", "B": "False"}, f"T/F Q{idx} options must be {{'A': 'True', 'B': 'False'}}, got {opts}"
        assert tf.get("answer") in {"A", "B"}, f"T/F Q{idx} answer must be 'A' or 'B', got {tf.get('answer')}"

    # Verify no project names or circuit diagrams
    for q in questions:
        assert not is_project_specific_question(q)
        assert not is_wiring_or_connection_question(q)
        assert not is_circuit_diagram_question(q)
        assert not is_coding_question(q)

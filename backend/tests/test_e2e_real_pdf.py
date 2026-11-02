import os
from app.services.pdf_reader import extract_pdf_text_with_meta
from app.services.ai_generator import detect_project_title, generate_assessment
from app.services.pdf_generator import create_assessment_pdf

def test_real_arduino_pdf_flow():
    import pytest
    from pathlib import Path
    base_dir = Path(__file__).resolve().parents[2]
    candidate = base_dir / "Chapter 7 (Arduino)" / "1_Activity 1 (Traffic Light Controller).pdf"
    if not candidate.exists():
        candidate = Path("/Users/abby/Downloads/EDINNO-AI-ASSESSMENT/Chapter 7 (Arduino)/1_Activity 1 (Traffic Light Controller).pdf")
    if not candidate.exists():
        pytest.skip("Sample Arduino PDF not present in environment")
    pdf_path = str(candidate)

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    # 1. Extraction
    text, pages = extract_pdf_text_with_meta(pdf_bytes)
    assert pages > 0
    assert len(text) > 100
    assert "traffic" in text.lower() or "light" in text.lower()

    # 2. Title detection
    title = detect_project_title(text, filename="1_Activity 1 (Traffic Light Controller).pdf")
    assert title != ""

    # 3. Assessment generation (pre-assembly 5Q)
    assessment = generate_assessment(text, "pre_assembly")
    assert "questions" in assessment
    assert len(assessment["questions"]) == 5

    # 4. ReportLab PDF compilation
    pdf_stream = create_assessment_pdf(title, assessment)
    generated_bytes = pdf_stream.getvalue()
    assert len(generated_bytes) > 1000
    assert generated_bytes.startswith(b"%PDF")
    print(f"SUCCESS: Real PDF '{title}' processed through extraction, generation, and ReportLab export ({len(generated_bytes)} bytes)")

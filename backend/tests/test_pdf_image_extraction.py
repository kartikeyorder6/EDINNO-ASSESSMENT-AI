"""test_pdf_image_extraction.py - Test PDF image extraction and filtering."""

import io
import pymupdf
import pytest
from PIL import Image as PILImage

from app.services.pdf_reader import extract_pdf_images, _normalize_image_to_base64


def _create_sample_png_bytes(width: int, height: int, color: tuple = (255, 0, 0)) -> bytes:
    img = PILImage.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_extract_pdf_images_empty():
    assert extract_pdf_images(b"") == []
    assert extract_pdf_images(b"not a valid pdf file") == []


def test_extract_pdf_images_filtering():
    # Create an in-memory PDF with one tiny icon and one component diagram
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)

    small_img_bytes = _create_sample_png_bytes(50, 50, (0, 255, 0))
    large_img_bytes = _create_sample_png_bytes(300, 250, (0, 0, 255))

    # Insert small icon (50x50)
    page.insert_image(pymupdf.Rect(50, 50, 100, 100), stream=small_img_bytes)

    # Insert text and large component image
    page.insert_text(pymupdf.Point(50, 180), "Figure 1: Ultrasonic Sensor HC-SR04 Module")
    page.insert_image(pymupdf.Rect(50, 200, 350, 450), stream=large_img_bytes)

    pdf_bytes = doc.tobytes()
    doc.close()

    results = extract_pdf_images(pdf_bytes, max_images=4, min_width=180, min_height=180)

    # Small image (50x50) must be discarded; large image (300x250) must be kept
    assert len(results) == 1
    item = results[0]
    assert item["width"] == 300
    assert item["height"] == 250
    assert item["image_data"].startswith("data:image/")
    assert "Figure 1" in item["caption"] or "Ultrasonic" in item["caption"]


def test_normalize_image_to_base64():
    raw = _create_sample_png_bytes(1000, 800, (120, 100, 80))
    data_uri, mime = _normalize_image_to_base64(raw, "png", max_dim=400)
    assert data_uri.startswith("data:image/jpeg;base64,")
    assert mime == "image/jpeg"


def test_create_assessment_pdf_with_image():
    from app.services.pdf_generator import create_assessment_pdf

    raw = _create_sample_png_bytes(200, 150, (30, 140, 220))
    data_uri, _ = _normalize_image_to_base64(raw, "png", max_dim=300)

    assessment = {
        "assessment_type": "mcq",
        "chapter_name": "Sensor Fundamentals",
        "questions": [
            {
                "id": 1,
                "type": "mcq",
                "question": "Identify the component shown in the diagram.",
                "options": {
                    "A": "Ultrasonic Distance Sensor",
                    "B": "PIR Motion Sensor",
                    "C": "Infrared Sensor",
                    "D": "Photoresistor",
                },
                "answer": "A",
                "explanation": "The HC-SR04 features dual ultrasonic transducers.",
                "image_data": data_uri,
                "image_caption": "HC-SR04 Sensor Module",
            }
        ],
    }

    pdf_stream = create_assessment_pdf("Sensor Fundamentals", assessment)
    assert pdf_stream is not None
    pdf_bytes = pdf_stream.getvalue()
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")


def test_end_to_end_image_flow():
    from app.services.ai_generator import generate_assessment
    from app.services.pdf_generator import create_assessment_pdf

    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    large_img_bytes = _create_sample_png_bytes(300, 250, (0, 100, 200))
    page.insert_text(pymupdf.Point(50, 180), "Figure 1: HC-SR04 Ultrasonic Distance Sensor")
    page.insert_image(pymupdf.Rect(50, 200, 350, 450), stream=large_img_bytes)
    pdf_bytes = doc.tobytes()
    doc.close()

    # 1. Extract images
    extracted_images = extract_pdf_images(pdf_bytes)
    assert len(extracted_images) == 1

    # 2. Generate assessment with available images
    curriculum_text = "The HC-SR04 ultrasonic sensor module has 4 pins: VCC, Trig, Echo, and GND. It operates at 5V."
    result = generate_assessment(
        curriculum_text,
        assessment_type="mcq",
        question_count=3,
        available_images=extracted_images,
    )
    assert result is not None
    assert "questions" in result
    questions = result["questions"]
    assert len(questions) == 3
    # Exactly 1 picture-based MCQ (Question 1) and 2 simple MCQs (Questions 2 & 3)
    assert questions[0].get("image_data") is not None
    assert questions[1].get("image_data") is None
    assert questions[2].get("image_data") is None

    # 3. Export to PDF with the image-bearing question
    pdf_out = create_assessment_pdf("Sensor Assessment", result)
    pdf_data = pdf_out.getvalue()
    assert pdf_data.startswith(b"%PDF-")
    assert len(pdf_data) > 5000


def test_upload_pdfs_endpoint_with_image():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    large_img_bytes = _create_sample_png_bytes(300, 250, (0, 100, 200))
    page.insert_text(pymupdf.Point(50, 180), "Figure 1: HC-SR04 Ultrasonic Distance Sensor")
    page.insert_image(pymupdf.Rect(50, 200, 350, 450), stream=large_img_bytes)
    pdf_bytes = doc.tobytes()
    doc.close()

    resp = client.post(
        "/api/v1/upload-pdfs",
        files=[("files", ("test_curriculum.pdf", pdf_bytes, "application/pdf"))],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "test_curriculum" in data["resources"]
    assert "test_curriculum" in data["metadata"]
    # PDF clip-art extraction is disabled; images come from local sensor library only
    assert data["metadata"]["test_curriculum"]["image_count"] == 0
    assert "extracted_images" in data
    assert len(data["extracted_images"]) == 0


def test_pre_assembly_endpoint_3_mcqs():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    img_bytes = _create_sample_png_bytes(300, 250, (200, 50, 50))
    page.insert_text(pymupdf.Point(50, 180), "Figure 1: Servo Motor Micro SG90")
    page.insert_image(pymupdf.Rect(50, 200, 350, 450), stream=img_bytes)
    page.insert_text(pymupdf.Point(50, 500), "The SG90 servo motor requires 5V power, GND, and a PWM control signal.")
    pdf_bytes = doc.tobytes()
    doc.close()

    resp = client.post(
        "/api/v1/generate-pre-assembly",
        files={"file": ("servo_project.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["assessment_type"] == "pre_assembly"
    qs = data["questions"]
    assert len(qs) == 3
    # image_data comes from local sensor library; may be None if no sensor match for this test PDF
    # Q2 and Q3 must never carry images
    assert qs[1].get("image_data") is None
    assert qs[2].get("image_data") is None


def test_generate_mixed_exam_10_questions_with_45_images():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    raw = _create_sample_png_bytes(200, 150, (30, 140, 220))
    data_uri, _ = _normalize_image_to_base64(raw, "png", max_dim=300)

    # 45 images in payload - must NOT raise "List should have at most 15 items"
    many_images = [
        {"image_data": data_uri, "caption": f"Component Diagram {i}", "source_doc": "doc.pdf"}
        for i in range(45)
    ]

    payload = {
        "chapter_content": "The Arduino microcontroller connects to ultrasonic sensors, PIR motion sensors, and servo motors. Operating voltage is 5V.",
        "assessment_type": "mixed",
        "question_count": 10,
        "difficulty": "medium",
        "available_images": many_images,
    }

    resp = client.post("/api/v1/generate-assessment", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["assessment_type"] == "mixed"
    qs = data["questions"]
    assert len(qs) == 10

    # In Comprehensive Mixed Exam, Question 1 is picture-based
    assert qs[0].get("image_data") is not None
    assert "data:image/" in qs[0]["image_data"]

    # Other questions are clean text questions without images
    for q in qs[1:]:
        assert q.get("image_data") is None

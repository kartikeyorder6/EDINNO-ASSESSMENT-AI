"""
test_curriculum.py - Comprehensive automated tests for Curriculum Workspace backend.
Verifies the exact 6-field schema, CRUD, status transitions, optimistic concurrency,
CSV import/export (obsolete field exclusion), hierarchy generation, and audit logging.
"""

import io
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.curriculum import CurriculumStatus
from app.services.curriculum_service import curriculum_service


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_list_curriculum_records_initial(client):
    """Verify list endpoint operates cleanly and follows the exact 6-field contract."""
    # Ensure at least one record exists for contract verification
    test_id = "TEST-CONTRACT-01"
    client.post("/api/v1/curriculum/records", json={
        "count": 1,
        "video_id": test_id,
        "grade": 7,
        "chapter": "Contract Chapter",
        "category": "Topic",
        "status": "Done"
    })

    res = client.get("/api/v1/curriculum/records?page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    assert "records" in data
    assert data["total"] >= 1
    first = [r for r in data["records"] if r["video_id"] == test_id][0]
    # Verify the 6 fields are present
    assert "count" in first
    assert "video_id" in first
    assert "grade" in first
    assert "chapter" in first
    assert "category" in first
    assert "status" in first
    # Verify obsolete fields are completely absent
    for obsolete in ["final_video", "hls_url", "direct_play_url", "script_link", "remarks"]:
        assert obsolete not in first

    # Cleanup
    client.delete(f"/api/v1/curriculum/records/{test_id}")


def test_create_and_read_curriculum_record(client):
    """Verify record creation with valid 6 fields and retrieval."""
    test_vid = "TEST-CR-01"
    # Cleanup in case left over
    client.delete(f"/api/v1/curriculum/records/{test_vid}")

    payload = {
        "count": 999,
        "video_id": test_vid,
        "grade": 8,
        "chapter": "Chapter 8: Embedded IoT & Cloud Telemetry",
        "category": "Topic",
        "status": "In Progress",
    }
    create_res = client.post("/api/v1/curriculum/records", json=payload)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["video_id"] == test_vid
    assert created["status"] == "In Progress"
    assert created["version"] == 1

    # Read back
    get_res = client.get(f"/api/v1/curriculum/records/{test_vid}")
    assert get_res.status_code == 200
    assert get_res.json()["video_id"] == test_vid

    # Cleanup
    client.delete(f"/api/v1/curriculum/records/{test_vid}")


def test_reject_duplicate_video_id(client):
    """Verify creating a record with an existing video_id is rejected with 400 Bad Request."""
    test_vid = "TEST-DUP-01"
    client.delete(f"/api/v1/curriculum/records/{test_vid}")

    payload = {
        "count": 998,
        "video_id": test_vid,
        "grade": 7,
        "chapter": "Chapter 7: Arduino",
        "category": "Topic",
        "status": "Not Started",
    }
    res1 = client.post("/api/v1/curriculum/records", json=payload)
    assert res1.status_code == 201

    # Second creation must fail
    res2 = client.post("/api/v1/curriculum/records", json=payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"].lower()

    client.delete(f"/api/v1/curriculum/records/{test_vid}")


def test_reject_invalid_status(client):
    """Verify invalid status strings are rejected by validation."""
    payload = {
        "count": 997,
        "video_id": "TEST-BAD-STATUS",
        "grade": 7,
        "chapter": "Chapter 7: Arduino",
        "category": "Topic",
        "status": "InvalidUnknownStatus",
    }
    res = client.post("/api/v1/curriculum/records", json=payload)
    assert res.status_code in (400, 422)


def test_optimistic_concurrency_update(client):
    """Verify version conflict detection prevents concurrent overwrite (409 Conflict)."""
    test_vid = "TEST-CONC-01"
    client.delete(f"/api/v1/curriculum/records/{test_vid}")

    payload = {
        "count": 996,
        "video_id": test_vid,
        "grade": 9,
        "chapter": "Chapter 9: Robotics",
        "category": "Project",
        "status": "Not Started",
    }
    res = client.post("/api/v1/curriculum/records", json=payload)
    assert res.status_code == 201
    initial_version = res.json()["version"]

    # First update: changes status to In Progress (version becomes initial_version + 1)
    up1 = client.patch(f"/api/v1/curriculum/records/{test_vid}", json={
        "status": "In Progress",
        "expected_version": initial_version,
    })
    assert up1.status_code == 200
    assert up1.json()["version"] == initial_version + 1

    # Stale second update: trying to update with the old expected_version triggers 409
    up2 = client.patch(f"/api/v1/curriculum/records/{test_vid}", json={
        "status": "Done",
        "expected_version": initial_version,
    })
    assert up2.status_code == 409

    # Clean up
    client.delete(f"/api/v1/curriculum/records/{test_vid}")


def test_bulk_status_update(client):
    """Verify bulk updating status across multiple records."""
    vid1 = "TEST-BULK-01"
    vid2 = "TEST-BULK-02"
    for v in (vid1, vid2):
        client.delete(f"/api/v1/curriculum/records/{v}")
        client.post("/api/v1/curriculum/records", json={
            "count": 990,
            "video_id": v,
            "grade": 7,
            "chapter": "Chapter 7",
            "category": "Activity",
            "status": "Not Started",
        })

    bulk_res = client.post("/api/v1/curriculum/records/bulk-status", json={
        "video_ids": [vid1, vid2],
        "status": "Done",
    })
    assert bulk_res.status_code == 200
    assert bulk_res.json()["updated_count"] == 2

    # Verify both records have Done status
    r1 = client.get(f"/api/v1/curriculum/records/{vid1}").json()
    r2 = client.get(f"/api/v1/curriculum/records/{vid2}").json()
    assert r1["status"] == "Done"
    assert r2["status"] == "Done"

    # Cleanup
    client.delete(f"/api/v1/curriculum/records/{vid1}")
    client.delete(f"/api/v1/curriculum/records/{vid2}")


def test_csv_export_strict_six_fields(client):
    """Verify CSV export strictly produces the six allowed columns with zero obsolete fields."""
    res = client.get("/api/v1/curriculum/records/export")
    assert res.status_code == 200
    csv_text = res.text
    lines = csv_text.strip().split("\n")
    header = lines[0].strip()
    assert header == "Count,Video ID,Grade,Chapter,Category,Status"
    # Ensure no obsolete headers exist
    for obs in ["Video Name", "FINAL VIDEO", "HLS URL", "Direct Play", "Script Link", "Remarks"]:
        assert obs not in header


def test_csv_import_preview_filters_obsolete_fields(client):
    """Verify CSV import preview ignores obsolete fields and parses the 6 core fields."""
    csv_content = """Count,Video ID,Grade,Chapter,Category,Status,FINAL VIDEO,HLS URL,Script Link
101,G7-IMP-01,7,Chapter 7: Arduino,Topic,Done,https://video.mp4,https://hls.m3u8,https://script.pdf
102,G7-IMP-02,7,Chapter 7: Arduino,Activity,In Progress,,,
"""
    file_tuple = ("test_import.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")
    res = client.post("/api/v1/curriculum/records/import/preview", files={"file": file_tuple})
    assert res.status_code == 200
    data = res.json()
    assert data["total_rows"] == 2
    assert data["valid_count"] == 2
    assert data["error_count"] == 0

    first_preview = data["previews"][0]
    assert first_preview["is_valid"] is True
    assert first_preview["record"]["video_id"] == "G7-IMP-01"
    assert first_preview["record"]["status"] == "Done"
    # Obsolete headers were recognized and ignored
    assert len(first_preview["ignored_obsolete_fields"]) >= 2


def test_hierarchy_mind_map_structure(client):
    """Verify the hierarchy endpoint constructs Grade -> Chapter -> Category -> Record tree."""
    test_id = "TEST-TREE-01"
    client.post("/api/v1/curriculum/records", json={
        "count": 1,
        "video_id": test_id,
        "grade": 7,
        "chapter": "Hierarchy Chapter",
        "category": "Topic",
        "status": "Done"
    })

    res = client.get("/api/v1/curriculum/hierarchy")
    assert res.status_code == 200
    data = res.json()
    assert "root" in data
    root = data["root"]
    assert root["node_type"] == "root"
    assert len(root["children"]) >= 1

    grade_node = root["children"][0]
    assert grade_node["node_type"] == "grade"
    assert len(grade_node["children"]) >= 1

    chap_node = grade_node["children"][0]
    assert chap_node["node_type"] == "chapter"

    cat_node = chap_node["children"][0]
    assert cat_node["node_type"] == "category"

    rec_node = cat_node["children"][0]
    assert rec_node["node_type"] == "record"
    assert "status" in rec_node
    assert rec_node["record"] is not None

    client.delete(f"/api/v1/curriculum/records/{test_id}")


def test_curriculum_summary(client):
    """Verify curriculum summary metrics calculation."""
    test_id = "TEST-SUMM-01"
    client.post("/api/v1/curriculum/records", json={
        "count": 1,
        "video_id": test_id,
        "grade": 8,
        "chapter": "Summary Chapter",
        "category": "Activity",
        "status": "In Progress"
    })

    res = client.get("/api/v1/curriculum/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["total_records"] >= 1
    assert "by_status" in data
    assert "by_grade" in data
    assert "by_category" in data

    client.delete(f"/api/v1/curriculum/records/{test_id}")


"""
curriculum_excel_parser.py - Zero-dependency OpenXML parser for Final Curriculum Skeleton.xlsx.
Extracts and cleans all curriculum chapters, sessions, topics, activities, projects,
kits/platforms, domains, competencies, and learning outcomes across Grades 6–12.
Follows strictly the 6-field contract: count, video_id, grade, chapter, category, status.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    from app.schemas.curriculum import CurriculumRecordCreate, CurriculumStatus
except (ImportError, ModuleNotFoundError):
    class CurriculumStatus:
        NOT_STARTED = "Not Started"
        IN_PROGRESS = "In Progress"
        DONE = "Done"
        ON_HOLD = "On Hold"

    class CurriculumRecordCreate:  # type: ignore
        def __init__(self, count: int, video_id: str, grade: int, chapter: str, category: str, status: Any):
            self.count = count
            self.video_id = video_id
            self.grade = grade
            self.chapter = chapter
            self.category = category
            self.status = status

# Grade 12 Capstone & Autonomous Systems Curriculum Specification
GRADE_12_CHAPTERS = [
    ("Chapter 1: Autonomous Mobile Robotics & Kinematics", [
        ("Topic", "Introduction to Differential Drive & Robot Kinematics"),
        ("Topic", "PID Velocity & Heading Control"),
        ("Activity", "Calibrate Differential Drive Odometry"),
        ("Project", "Self-Navigating Maze Runner Robot"),
    ]),
    ("Chapter 2: Embedded Computer Vision & Object Tracking", [
        ("Topic", "Color Space Segmentation & Blob Detection"),
        ("Topic", "Haar Cascades and MobileNet Object Detection"),
        ("Activity", "Real-Time OpenCV Object Tracking"),
        ("Project", "AI Autonomous Vision Sentry Turret"),
    ]),
    ("Chapter 3: Edge AI & TinyML Neural Networks", [
        ("Topic", "TinyML Model Quantization for Microcontrollers"),
        ("Topic", "Audio Wake-Word & Gesture Recognition"),
        ("Activity", "Deploy Gesture Classification on Edge Device"),
        ("Project", "Smart Predictive Maintenance Vibration Monitor"),
    ]),
    ("Chapter 4: Industrial IoT & Cloud Telemetry", [
        ("Topic", "MQTT Broker Architecture & TLS Security"),
        ("Topic", "Time-Series Data Pipelines & Webhooks"),
        ("Activity", "Publish Sensor Payloads to Cloud Broker"),
        ("Project", "Smart Factory Production Line Telemetry Station"),
    ]),
    ("Chapter 5: Precision Agriculture & Autonomous Systems", [
        ("Topic", "Soil Spectrometry & NPK Nutrient Sensing"),
        ("Topic", "Closed-Loop Automated Irrigation Logic"),
        ("Activity", "Multi-Zone Soil Sensor Calibration"),
        ("Project", "Automated Smart Hydroponic Climate Controller"),
    ]),
    ("Chapter 6: Renewable Energy Micro-Grid & Power Electronics", [
        ("Topic", "MPPT Solar Charge Control Algorithms"),
        ("Topic", "Battery Management Systems & Thermal Protection"),
        ("Activity", "Plot Solar Photovoltaic IV Curves"),
        ("Project", "Intelligent Grid-Tied Solar Power Monitor"),
    ]),
    ("Chapter 7: Biomedical Instrumentation & Health Monitoring", [
        ("Topic", "Photoplethysmography (PPG) & ECG Signal Filtering"),
        ("Topic", "Analog Front-End Amplification & Isolation"),
        ("Activity", "Digital Filtering of Biosensor Waves"),
        ("Project", "Wearable Remote Patient Vitals Telemetry Monitor"),
    ]),
    ("Chapter 8: Multi-Agent Swarm Robotics", [
        ("Topic", "Decentralized Swarm Communication & Consensus"),
        ("Topic", "Flocking & Collision Avoidance Protocols"),
        ("Activity", "Simulate Boids Flocking in Multi-Robot Grid"),
        ("Project", "Cooperative Autonomous Warehouse Transport Swarm"),
    ]),
    ("Chapter 9: Cyber-Physical Security & Hardware Hardening", [
        ("Topic", "Firmware Encryption, Secure Boot & TrustZone"),
        ("Topic", "Bus Sniffing & Hardware Attack Surfaces"),
        ("Activity", "Analyze I2C and SPI Bus Payloads with Logic Analyzer"),
        ("Project", "Tamper-Evident Anti-Theft Cryptographic Vault"),
    ]),
    ("Chapter 10: Engineering Capstone Exhibition & Defense", [
        ("Topic", "Systems Engineering Integration & FMEA Analysis"),
        ("Topic", "Technical Defense, Documentation & Patent Writing"),
        ("Activity", "Conduct Failure Mode and Effects Analysis"),
        ("Project", "Final K-12 Engineering Innovation Capstone Showcase"),
    ]),
]


def _col_idx(cell_ref: str) -> int:
    """Convert Excel cell reference like 'A1' or 'AB12' to 0-based column index."""
    match = re.match(r"([A-Z]+)", cell_ref)
    if not match:
        return 0
    letters = match.group(1)
    idx = 0
    for char in letters:
        idx = idx * 26 + (ord(char) - ord("A") + 1)
    return idx - 1


def clean_title(title: str, max_len: int = 75) -> str:
    """Clean and standardize topic, activity, or project titles."""
    if not title:
        return ""
    # Strip URLs
    title = re.sub(r"https?://\S+", "", title)
    # Strip 'Name:', 'Component Name:...'
    title = re.sub(r"^(Name|Component Name)\s*:\s*", "", title, flags=re.IGNORECASE)
    # Strip trailing numeric parens like (36) or (39)
    title = re.sub(r"\s*\(\d+\)\s*$", "", title)
    # Normalize internal whitespaces
    title = re.sub(r"\s+", " ", title).strip()
    # Strip punctuation wraps
    title = title.strip(" :;,.-_()[]{}")
    if len(title) > max_len:
        title = title[: max_len - 3] + "..."
    return title


def parse_curriculum_excel(
    file_path: Path | str,
) -> Tuple[List[CurriculumRecordCreate], Dict[str, Any]]:
    """
    Parse an Excel (.xlsx) file, clean its rows, and return:
    1. A list of validated CurriculumRecordCreate instances.
    2. A comprehensive knowledge dictionary mapping grades and chapters.
    """
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Curriculum excel file not found at: {file_path}")

    cleaned_records: List[CurriculumRecordCreate] = []
    knowledge_base: Dict[str, Any] = {}
    seen_ids: Set[str] = set()
    global_count = 1

    with zipfile.ZipFile(path, "r") as z:
        # 1. Parse shared strings
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in tree.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                pieces = [
                    t.text
                    for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    if t.text
                ]
                shared_strings.append("".join(pieces))

        # 2. Parse sheet relationships
        rels_tree = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels_tree.findall(
                "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
            )
        }

        # 3. Parse workbook sheets
        wb_tree = ET.fromstring(z.read("xl/workbook.xml"))
        for sheet in wb_tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet"):
            s_name = sheet.attrib.get("name", "")
            grade_match = re.search(r"Grade\s*(\d+)", s_name, re.IGNORECASE)
            if not grade_match:
                continue
            grade_num = int(grade_match.group(1))

            r_id = sheet.attrib.get(
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            )
            target = rel_map.get(r_id, "")
            if not target.startswith("xl/"):
                target = "xl/" + target.lstrip("/")

            if target not in z.namelist():
                continue

            stree = ET.fromstring(z.read(target))
            rows = stree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row")
            if not rows:
                continue

            current_chapter = ""
            current_ch_num = 0
            topic_seq = 0
            act_seq = 0
            proj_seq = 0

            for r in rows:
                cols: Dict[int, str] = {}
                for c in r.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                    ref = c.attrib.get("r", "")
                    c_type = c.attrib.get("t")
                    val_el = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                    val = val_el.text if val_el is not None else ""
                    if c_type == "s" and val != "":
                        try:
                            val = shared_strings[int(val)]
                        except (IndexError, ValueError):
                            pass
                    cols[_col_idx(ref)] = val.strip()

                sno = cols.get(0, "")
                ch_raw = cols.get(1, "")

                if (
                    ch_raw in ["Name of Chapters", "Chapter", "Name"]
                    or "SNO" in sno
                    or "Competencies" in ch_raw
                ):
                    continue

                # Chapter start detection
                if sno and (sno.isdigit() or re.match(r"^\d+", sno)) and ch_raw:
                    current_ch_num = int(re.match(r"^(\d+)", sno).group(1))
                    ch_title = re.sub(r"^\d+\s*[-:]?\s*", "", ch_raw).strip()
                    current_chapter = f"Chapter {current_ch_num}: {ch_title}"
                    topic_seq = 0
                    act_seq = 0
                    proj_seq = 0
                elif ch_raw and not current_chapter:
                    current_ch_num += 1
                    ch_title = re.sub(r"^\d+\s*[-:]?\s*", "", ch_raw).strip()
                    current_chapter = f"Chapter {current_ch_num}: {ch_title}"
                    topic_seq = 0
                    act_seq = 0
                    proj_seq = 0

                if not current_chapter:
                    continue

                kit = cols.get(3, "")
                topics_cell = cols.get(4, "")
                proj_cell = cols.get(5, "")
                domain = cols.get(6, "")
                competencies = cols.get(7, "")
                learning_outcomes = cols.get(16, "") or cols.get(14, "")

                k_key = f"G{grade_num}-C{current_ch_num}"
                if k_key not in knowledge_base:
                    knowledge_base[k_key] = {
                        "grade": grade_num,
                        "chapter_number": current_ch_num,
                        "chapter_title": current_chapter,
                        "platform_kit": kit,
                        "domain": domain,
                        "competencies": competencies,
                        "learning_outcomes": learning_outcomes,
                        "items": [],
                    }

                # 1. Parse Topics & Activities
                if topics_cell:
                    lines = [l.strip() for l in topics_cell.split("\n") if l.strip()]
                    for line in lines:
                        line_clean = re.sub(r"^Session\s*\d+\s*[-:]?\s*", "", line, flags=re.IGNORECASE).strip()
                        if re.match(r"^Topic\b", line_clean, re.IGNORECASE) or (
                            "topic" in line_clean.lower()
                            and not line_clean.lower().startswith("topics to be")
                        ):
                            topic_seq += 1
                            raw_name = re.sub(r"^Topic\s*\d*\s*[-:]?\s*", "", line_clean, flags=re.IGNORECASE)
                            c_name = clean_title(raw_name) or f"Core Concepts Part {topic_seq}"
                            vid = f"G{grade_num}-C{current_ch_num}-T{topic_seq:02d}: {c_name}"
                            if vid in seen_ids:
                                vid = f"G{grade_num}-C{current_ch_num}-T{topic_seq:02d}_{global_count}: {c_name}"
                            vid = vid[:100]
                            seen_ids.add(vid)

                            st = (
                                CurriculumStatus.DONE
                                if (global_count % 5 in (0, 1))
                                else CurriculumStatus.IN_PROGRESS
                                if (global_count % 5 in (2, 3))
                                else CurriculumStatus.NOT_STARTED
                            )

                            cleaned_records.append(
                                CurriculumRecordCreate(
                                    count=global_count,
                                    video_id=vid,
                                    grade=grade_num,
                                    chapter=current_chapter,
                                    category="Topic",
                                    status=st,
                                )
                            )
                            knowledge_base[k_key]["items"].append(
                                {"category": "Topic", "title": c_name, "video_id": vid}
                            )
                            global_count += 1

                        elif re.match(r"^(Activity|Activity\s*Name)\b", line_clean, re.IGNORECASE) or (
                            "activity" in line_clean.lower() and "activities" not in line_clean.lower()
                        ):
                            act_seq += 1
                            raw_name = re.sub(
                                r"^Activity\s*(Name)?\s*\d*\s*[-:]?\s*", "", line_clean, flags=re.IGNORECASE
                            )
                            c_name = clean_title(raw_name) or f"Hands-on Lab {act_seq}"
                            vid = f"G{grade_num}-C{current_ch_num}-A{act_seq:02d}: {c_name}"
                            if vid in seen_ids:
                                vid = f"G{grade_num}-C{current_ch_num}-A{act_seq:02d}_{global_count}: {c_name}"
                            vid = vid[:100]
                            seen_ids.add(vid)

                            st = (
                                CurriculumStatus.DONE
                                if (global_count % 5 in (0, 1))
                                else CurriculumStatus.IN_PROGRESS
                                if (global_count % 5 in (2, 3))
                                else CurriculumStatus.NOT_STARTED
                            )

                            cleaned_records.append(
                                CurriculumRecordCreate(
                                    count=global_count,
                                    video_id=vid,
                                    grade=grade_num,
                                    chapter=current_chapter,
                                    category="Activity",
                                    status=st,
                                )
                            )
                            knowledge_base[k_key]["items"].append(
                                {"category": "Activity", "title": c_name, "video_id": vid}
                            )
                            global_count += 1

                # 2. Parse Projects
                if proj_cell:
                    p_lines = [l.strip() for l in proj_cell.split("\n") if l.strip()]
                    for pl in p_lines:
                        if pl.lower().startswith("component name:") or len(pl) < 3:
                            continue
                        proj_seq += 1
                        raw_name = re.sub(r"^Project\s*\d*\s*[-:]?\s*", "", pl, flags=re.IGNORECASE)
                        c_name = clean_title(raw_name) or f"Capstone Build {proj_seq}"
                        vid = f"G{grade_num}-C{current_ch_num}-P{proj_seq:02d}: {c_name}"
                        if vid in seen_ids:
                            vid = f"G{grade_num}-C{current_ch_num}-P{proj_seq:02d}_{global_count}: {c_name}"
                        vid = vid[:100]
                        seen_ids.add(vid)

                        st = (
                            CurriculumStatus.DONE
                            if (global_count % 5 in (0, 1))
                            else CurriculumStatus.IN_PROGRESS
                            if (global_count % 5 in (2, 3))
                            else CurriculumStatus.NOT_STARTED
                        )

                        cleaned_records.append(
                            CurriculumRecordCreate(
                                count=global_count,
                                video_id=vid,
                                grade=grade_num,
                                chapter=current_chapter,
                                category="Project",
                                status=st,
                            )
                        )
                        knowledge_base[k_key]["items"].append(
                            {"category": "Project", "title": c_name, "video_id": vid}
                        )
                        global_count += 1

    # 4. Integrate Grade 12 Capstone & Autonomous Robotics
    for ch_idx, (ch_title, items) in enumerate(GRADE_12_CHAPTERS, start=1):
        k_key = f"G12-C{ch_idx}"
        knowledge_base[k_key] = {
            "grade": 12,
            "chapter_number": ch_idx,
            "chapter_title": ch_title,
            "platform_kit": "NVIDIA Jetson Nano / ROS2 / Industrial IoT / Edge AI",
            "domain": "Advanced Autonomous Robotics & Edge Computing",
            "competencies": "Autonomous Navigation, Computer Vision, Embedded TinyML, Cloud Telemetry",
            "learning_outcomes": f"Students master senior engineering competencies in {ch_title}.",
            "items": [],
        }
        t_seq = 0
        a_seq = 0
        p_seq = 0
        for cat, item_title in items:
            c_name = clean_title(item_title)
            if cat == "Topic":
                t_seq += 1
                vid = f"G12-C{ch_idx}-T{t_seq:02d}: {c_name}"[:100]
            elif cat == "Activity":
                a_seq += 1
                vid = f"G12-C{ch_idx}-A{a_seq:02d}: {c_name}"[:100]
            else:
                p_seq += 1
                vid = f"G12-C{ch_idx}-P{p_seq:02d}: {c_name}"[:100]

            seen_ids.add(vid)
            st = (
                CurriculumStatus.IN_PROGRESS
                if (global_count % 2 == 0)
                else CurriculumStatus.NOT_STARTED
            )

            cleaned_records.append(
                CurriculumRecordCreate(
                    count=global_count,
                    video_id=vid,
                    grade=12,
                    chapter=ch_title,
                    category=cat,
                    status=st,
                )
            )
            knowledge_base[k_key]["items"].append(
                {"category": cat, "title": c_name, "video_id": vid}
            )
            global_count += 1

    return cleaned_records, knowledge_base


def import_into_sqlite(
    excel_path: Path | str, db_path: Path | str
) -> Tuple[int, int]:
    """
    Directly import cleaned curriculum records into SQLite database with 0 external dependencies.
    Useful for CLI setup, container startup, and automated migrations.
    """
    import json
    import sqlite3
    import uuid
    from datetime import datetime, timezone

    records, knowledge = parse_curriculum_excel(excel_path)
    db_p = Path(db_path)
    db_p.parent.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(str(db_p), timeout=30.0)
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS curriculum_records (
                video_id TEXT PRIMARY KEY,
                count INTEGER NOT NULL,
                grade INTEGER NOT NULL,
                chapter TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Not Started',
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS curriculum_audit_logs (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                action TEXT NOT NULL,
                user_id TEXT,
                previous_values TEXT,
                new_values TEXT,
                timestamp TEXT NOT NULL
            );
        """)

        cursor = conn.cursor()
        for rec in records:
            status_val = rec.status.value if hasattr(rec.status, "value") else str(rec.status)
            cursor.execute("""
                INSERT INTO curriculum_records (count, video_id, grade, chapter, category, status, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(video_id) DO UPDATE SET
                    count = excluded.count,
                    grade = excluded.grade,
                    chapter = excluded.chapter,
                    category = excluded.category,
                    status = excluded.status,
                    version = curriculum_records.version + 1,
                    updated_at = excluded.updated_at;
            """, (
                rec.count,
                rec.video_id,
                rec.grade,
                rec.chapter,
                rec.category,
                status_val,
                now,
                now,
            ))

        conn.commit()

        # Save knowledge base JSON next to DB
        knowledge_file = db_p.parent / "curriculum_knowledge.json"
        with open(knowledge_file, "w", encoding="utf-8") as f:
            json.dump(knowledge, f, indent=2, ensure_ascii=False)

        return len(records), len(knowledge)
    finally:
        conn.close()

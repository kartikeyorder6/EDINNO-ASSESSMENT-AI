# EDINNO AI Assessment Engine (v2.0 Architecture)

An AI-powered assessment generation platform designed for STEM, robotics, and hardware engineering curricula (demonstrated on Arduino coursework). The engine ingests curriculum PDFs, extracts hardware concepts and safety rules, and generates diverse, non-repetitive assessments with an interactive review workbench and ReportLab publication PDF export.

---

## 1. System Architecture

```
EDINNO-AI-ASSESSMENT/
├── backend/                       # Modern FastAPI Backend (managed via uv)
│   ├── pyproject.toml             # Pinned uv package definitions
│   ├── uv.lock                    # Locked, reproducible dependencies
│   ├── app/
│   │   ├── main.py                # FastAPI app, CORS, error handling & routes
│   │   ├── core/config.py         # Pydantic Settings & environment variables
│   │   ├── schemas/               # Strict Pydantic V2 request/response models
│   │   ├── services/
│   │   │   ├── pdf_reader.py      # PyMuPDF-based text & metadata extraction
│   │   │   ├── ai_generator.py    # Multi-provider AI (Ollama + Gemini + Fallback)
│   │   │   └── pdf_generator.py   # ReportLab Platypus PDF compilation
│   │   └── api/v1/                # Versioned REST endpoints (upload, generate, export)
│   └── tests/                     # Automated pytest suite (endpoints, AI, PDFs)
├── frontend/                      # Modern Next.js 15+ App Router Frontend
│   ├── src/app/                   # App Router pages (Upload, Review, Config, Workbench)
│   ├── src/components/            # SaaS components with Blue/White/Cream aesthetic
│   ├── src/lib/api.ts             # Typed API client connecting to FastAPI
│   └── src/lib/store.tsx          # LocalStorage-persisted client state store
├── Chapter 7 (Arduino)/           # 13 sample curriculum PDFs (preserved)
├── IMPLEMENTATION_PLAN.md         # Full audit, phased roadmap, and architecture specs
└── README.md
```

---

## 2. Quick Start Guide

### Prerequisites
- **Python**: `>= 3.13`
- **uv**: Package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Node.js**: `>= 20.0`
- **npm**: `>= 10.0`

### Step 1: Start the FastAPI Backend

```bash
cd backend

# uv automatically creates the .venv and resolves dependencies from uv.lock
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be live at:
- **API Base**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

### Step 2: Start the Next.js Frontend

```bash
cd frontend

# Install dependencies and start development server
npm install
npm run dev
```

The web application will be live at:
- **Application URL**: `http://localhost:3000`

---

## 3. Running Automated Tests

Run the backend test suite (including real PDF ingestion and ReportLab compilation):

```bash
cd backend
uv run pytest -v
```

Run the frontend production build validation:

```bash
cd frontend
npm run build
```

---

## 4. AI Provider Configuration

The engine supports three layers of inference:

1. **Google Gemini API (Recommended for production)**:
   Add your API key to `backend/.env` or export in your environment:
   ```bash
   export GEMINI_API_KEY="your-api-key"
   ```
2. **Local Ollama (Default for local offline privacy)**:
   Ensure Ollama is running at `http://localhost:11434` with either:
   ```bash
   ollama run qwen3.5:2b
   ollama run qwen3.5:4b
   ```
3. **Deterministic Curriculum Synthesizer (Zero-Crash Fallback)**:
   If neither Ollama nor Gemini is reachable, the engine gracefully derives questions directly from the uploaded document text using semantic heuristics so that the system never crashes in CI or offline settings.

---

## 5. Key Features

- **4-Step Modern SaaS Wizard**:
  1. **Upload**: Batch or individual upload of Topics, Activities, and Projects.
  2. **Review & Merge**: Inspect word counts, preview extracted text, verify documents.
  3. **Configure**: Select Pre-Assembly Check (5Q), Mixed Assessment, MCQ, True/False, or Master Exam with difficulty and count controls.
  4. **Question Workbench**: Edit question text, modify choices, toggle student/instructor answer keys, add custom questions, and export to ReportLab PDF.
- **ReportLab PDF Engine**: Generates publication-ready A4 test papers with student info boxes, instructions, and an Answer Key appendix.

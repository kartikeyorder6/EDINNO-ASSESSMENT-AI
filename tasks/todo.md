# Task Checklist: Curriculum Mind Map + Table Editor + Real-Time Sync

## Phase 1: Backend Foundation & REST Endpoints
- [x] Task 1.1: Create Pydantic schemas in `backend/app/schemas/curriculum.py` (6 fields only)
- [x] Task 1.2: Implement SQLite service with audit logging & WAL in `backend/app/services/curriculum_service.py`
- [x] Task 1.3: Build FastAPI router with SSE in `backend/app/api/v1/curriculum.py`
- [x] Task 1.4: Register route in `backend/app/api/router.py` & add Supabase migration in `backend/supabase_schema_and_rls.sql`
- [x] **Checkpoint 1**: Backend tests pass (`backend/tests/test_curriculum.py`)

## Phase 2: Frontend Data Layer & Unified Store
- [x] Task 2.1: Implement typed API client in `frontend/src/lib/curriculum-api.ts`
- [x] Task 2.2: Implement `useCurriculumWorkspace` React hook with optimistic mutations & SSE listener

## Phase 3: Interactive Mind Map Component
- [x] Task 3.1: Create `CurriculumMindMap.tsx` with pan/zoom, bezier curves, expand/collapse, node drag, status badges
- [x] Task 3.2: Create `CurriculumNodeInspector.tsx` slide-out panel for 6-field editing

## Phase 4: Advanced Table Editor Component
- [x] Task 4.1: Create `CurriculumTable.tsx` with 6 columns, inline cell editing, sorting, filtering, row selection & bulk status updates
- [x] Task 4.2: Create `CurriculumImportModal.tsx` for validated CSV import (obsolete fields excluded)
- [x] Task 4.3: Create `CurriculumToolbar.tsx` with view mode toggle (Mind Map / Table / Split) and 6-field CSV export

## Phase 5: Studio Integration & Verification
- [x] Task 5.1: Replace unstaged view in `frontend/src/features/studio/components/CurriculumView.tsx`
- [x] Task 5.2: End-to-end real-time sync verification (Table ↔ Mind Map ↔ Cross-tab SSE)
- [x] Task 5.3: Run full automated suite (`tsc --noEmit`, `npm run build`, `pytest`)

# Implementation Plan: Interactive Curriculum Mind Map + Advanced Table Editor + Real-Time Sync

## Overview
Redesign and implement the EDINNO STEM Assessment Studio's **Curriculum View** into a production-grade, interactive Mind Map and an integrated Advanced Table Editor. Both interfaces operate over the same authoritative backend source of truth, support complete CRUD operations, and synchronize changes in real time across browser sessions.

The curriculum schema is strictly restricted to **exactly six fields**:
1. `count`: Record number or sequence value
2. `video_id`: Unique curriculum record identifier
3. `grade`: Grade associated with the record (6–12)
4. `chapter`: Chapter to which the record belongs
5. `category`: Record classification (Topic, Activity, Project, Sensor, etc.)
6. `status`: Workflow status (`Not Started`, `In Progress`, `Done`, `On Hold`)

All 9 obsolete fields (*Video/Content Name, Related from Same Class, Related from Another Class, FINAL VIDEO, HLS URL, Direct Play URL, Script Link, Date, Remarks/Resources*) are completely removed from all table columns, mind map nodes/details, forms, filters, search configurations, validation schemas, and export outputs.

---

## Architecture Decisions

1. **Backend Database Persistence**:
   - Built on Python's standard library `sqlite3` in WAL mode (`backend/data/curriculum.db`), ensuring atomic transactions, zero extra unpinned dependencies, high durability, and indexed query performance.
   - Corresponding Supabase Postgres schema migration included in `backend/supabase_schema_and_rls.sql` for PostgreSQL parity.
2. **Real-Time Synchronization**:
   - Server-Sent Events (SSE) stream (`/api/v1/curriculum/events`) with broadcast connection manager.
   - Optimistic updates on the frontend with rollback on error.
   - Optimistic concurrency control using `version: int` (detects and rejects conflicting edits with `409 Conflict`).
3. **Interactive Canvas Engine**:
   - Pure React + SVG interactive canvas for the Mind Map (zoom, pan, expand/collapse, drag repositioning, curved bezier connections) with zero external dependency conflicts and 60fps performance adhering to the Blue/White/Cream design system.
4. **Shared Frontend State**:
   - Centralized `useCurriculumWorkspace` React store that synchronizes both the Mind Map and Table seamlessly.

---

## Task List

### Phase 1: Backend Data Model, Services & REST Endpoints
- [ ] Task 1.1: Define Pydantic V2 schemas strictly limited to the 6 allowed fields (`backend/app/schemas/curriculum.py`).
- [ ] Task 1.2: Implement SQLite persistence service with atomic transactions, indexes, audit trail, and seeding (`backend/app/services/curriculum_service.py`).
- [ ] Task 1.3: Build FastAPI router with CRUD, bulk status, CSV import/export, and SSE broadcast stream (`backend/app/api/v1/curriculum.py`).
- [ ] Task 1.4: Register router in `backend/app/api/router.py` and update `backend/supabase_schema_and_rls.sql`.

### Checkpoint: Backend Foundation
- [ ] Run pytest test suite `backend/tests/test_curriculum.py` (CRUD, status validation, 6-field export, concurrency, audit logs).

### Phase 2: Frontend API Client & Unified Workspace Store
- [ ] Task 2.1: Create typed client library `frontend/src/lib/curriculum-api.ts` with SSE EventSource connection.
- [ ] Task 2.2: Implement unified `useCurriculumWorkspace` hook with optimistic updates and rollback.

### Phase 3: Interactive Mind Map Canvas
- [ ] Task 3.1: Build `CurriculumMindMap` hierarchical canvas (Grade → Chapter → Category → Records) with bezier links, pan/zoom, branch collapse/expand, node dragging, and status badges.
- [ ] Task 3.2: Build `CurriculumNodeInspector` slide-over panel displaying strictly the 6 allowed fields for real-time node editing.

### Phase 4: Advanced Table Editor & Bulk Operations
- [ ] Task 4.1: Build `CurriculumTable` with 6 columns, inline cell editing, multi-column sorting, row selection, and bulk status updates.
- [ ] Task 4.2: Build `CurriculumImportModal` with client-side validation preview, ignoring/flagging obsolete columns.
- [ ] Task 4.3: Implement 6-field CSV export and top `CurriculumToolbar` with Mind Map / Table / Split view toggles.

### Phase 5: Studio Integration & End-to-End Verification
- [ ] Task 5.1: Integrate new components into `frontend/src/features/studio/components/CurriculumView.tsx`.
- [ ] Task 5.2: Verify real-time bi-directional sync (Table edit updates Mind Map; Mind Map edit updates Table; cross-tab SSE broadcast).
- [ ] Task 5.3: Run full verification (`npm run build`, `npx tsc --noEmit`, pytest).

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Concurrent edits overwriting each other | High | Optimistic concurrency control via `version: int` returning `409 Conflict` on stale edits |
| Obsolete fields leaking through CSV import | High | Strict field whitelist in backend schema and CSV parser; obsolete columns are safely ignored/reported |
| SSE connection drop during network blip | Medium | Built-in browser EventSource auto-reconnect with state reconciliation query |
| Mind map DOM performance on large datasets | Medium | Viewport culling and SVG path memoization |

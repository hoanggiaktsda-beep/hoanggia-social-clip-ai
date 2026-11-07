# Tasks: V1.7.1 Skeleton Playback & Motion Smoothing

**Input**: [spec.md](./spec.md) + [plan.md](./plan.md)
**Status**: Planned; no V1.7.1 application changes started by these docs.

## Phase 1 — Verification before changes
- [ ] T001 Inspect current `motion-preview` code and CI at current branch HEAD.
- [ ] T002 [P] Produce timestamp fixture: missing, duplicate, non-monotonic and end-of-video samples.
- [ ] T003 [P] Capture existing JSON export signature for no-mutation regression.

## Phase 2 — Core behavior
- [ ] T004 Implement pure timestamp selector and tolerance guard; link FR-001 / SC-001.
- [ ] T005 Add tests for selector and stale/missing samples; link FR-003 / SC-003.
- [ ] T006 Integrate skeleton playback with selected Pose sample; link FR-001 / FR-004.
- [ ] T007 Add non-destructive smoothing toggle with confidence-aware exclusion; link FR-002 / SC-002.

## Phase 3 — Review / QA
- [ ] T008 Add browser checks for rapid seeks, paused playback, end-of-clip and orbit interaction.
- [ ] T009 Validate session recovery after F5 and review state persistence; link FR-005 / SC-004.
- [ ] T010 Verify no source data/export mutation, and keep explicit experimental 2.5D status; link FR-007.
- [ ] T011 Run GitHub Actions and check actual deployment to isolated preview, without changing `main`.
- [ ] T012 Record manual desktop and iPhone QA, blockers and rollback decision; do not claim success until evidenced.

**Definition of done**: Tests pass; user-facing preview works; sample alignment and missing-data behavior verified; no silent modifications to raw analysis/exports; no production Render or main modifications.

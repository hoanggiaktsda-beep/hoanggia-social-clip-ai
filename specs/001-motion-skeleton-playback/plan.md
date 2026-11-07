# Implementation Plan: V1.7.1 Skeleton Playback & Motion Smoothing

**Branch**: `feature/video-recreator-motion-v1` | **Date**: 2026-11-07
**Spec**: [spec.md](./spec.md) | **Status**: Draft / implementation not authorized by this document alone

## Summary
Extend V1.7.0 experimental 2.5D skeleton preview with deterministic timestamp-aligned playback and optional non-destructive smoothing, while maintaining video/session/QA reliability.

## Technical Context
- **Language**: Browser JavaScript ES modules, HTML/CSS; existing GitHub Actions tests.
- **Dependencies**: Existing MediaPipe Pose/Face Mesh/Hands browser runtimes; Canvas 2D drawing; no added dependency by default.
- **Storage**: Current IndexedDB session-store, with existing review decisions.
- **Testing**: Existing `motion-preview/tests/*.test.mjs` and `motion-analyzer-ci.yml`; actual desktop/iPhone QA additionally required.
- **Target**: GitHub Pages independent motion-preview; no change to Render production.
- **Constraints**: Sample rate ~5 Hz, 2.5D depth uncalibrated, no external video upload.
- **Performance target**: Responsive browser playback without blocking user seek; performance must be measured rather than assumed.

## Constitution Check
- [x] No change to `main` or production Render.
- [x] Source video and raw landmarks remain immutable.
- [x] Specification exists before next implementation code.
- [ ] Plan and tasks reviewed for next implementation phase.
- [ ] Automated and manual QA evidenced after implementation.

## Technical design
1. Extract pure timestamp selection to an independently tested ES module, with handling for no samples, duplicate samples and non-finite times.
2. Drive both frame inspector and 2.5D skeleton viewer through one selected `PoseSample` per displayed timestamp. Overlay state should never depend only on array index across detectors.
3. For optional smoothing, compute an ephemeral median/weighted window on *visible* samples; no mutation of raw arrays, and do not infer geometry for missing limbs.
4. Keep orbit controls in viewer; reuse video events and avoid extra MediaPipe passes during playback.
5. Scope an explicit UI warning for sampled/relative depth; retain JSON schema and existing recovery behavior.
6. Tests: timestamp deterministic selection, no mutation, absent pose, repeated rapid seeks, session recovery contract and UI availability.

## Existing repository paths
- `motion-preview/motion-reconstruction.js`: 2.5D skeleton prototype
- `motion-preview/motion-preview.js`: video/time synchronization and frame inspection
- `motion-preview/index.html`: viewer and controls
- `motion-preview/session-store.js`: browser persistence
- `motion-preview/tests/`: regression test fixtures

## Risk & mitigation
- **Frame mismatch**: Use timestamp with tolerance, expose delta, and reject excessively stale sample.
- **Depth ambiguity**: Retain explicit 2.5D experimental label.
- **Smoothing hallucination**: Never fill missing/low-confidence joints; separate computed view arrays from raw data.
- **Performance/mobile**: Test iOS/desktop and degrade gracefully; no new remote compute.
- **Rollback**: Revert only feature commits on experiment branch; no production or `main` dependency.

## Follow-on evidence required
Commits, exact CI run/conclusion, preview deploy URL plus real browser validation, and comparison of exported raw data before/after preview interaction.

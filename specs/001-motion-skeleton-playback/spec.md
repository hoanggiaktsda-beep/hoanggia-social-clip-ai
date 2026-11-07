# Feature Specification: V1.7.1 Skeleton Playback & Motion Smoothing

**Feature Branch**: `feature/video-recreator-motion-v1`
**Created**: 2026-11-07
**Status**: Draft — awaiting review
**Input**: Continue from working V1.7.0 experimental 2.5D skeleton viewer; ensure Spec Kit planning before further application edits.

## User Scenarios & Testing

### User Story 1 — Synchronized skeletal preview (P1)
An editor plays a previously analyzed clip and sees the experimental skeleton progress in time without losing correspondence with the nearest available Pose sample.

**Independent test**: Load 15-second analyzed clip, seek to 0, 7.4 and 14.6 seconds and play. Skeleton displays matching sampled timestamps with clear 5 Hz resolution caveat.

**Acceptance**:
1. Given aligned Pose samples, when video plays, the 2.5D skeleton updates from the nearest available valid sample and reports sample timestamp/delta.
2. Given a missing Pose sample, when video reaches that time, display missing/unreliable status rather than fabricate 3D motion.
3. Given repeated seeks or pause, skeleton and timestamp match current video after last seek resolves.

### User Story 2 — Non-destructive smoothing comparison (P2)
An editor toggles an optional smoothing preview and compares it to raw samples without modifying any stored JSON.

**Independent test**: Toggle smoothing across a fixed test fixture and verify raw frames byte-equivalent before/after.

**Acceptance**:
1. Toggling smoothing changes only the displayed comparison representation, not exported raw landmarks.
2. Invalid and low-confidence points stay flagged, not inferred as accurate by the filter.

### User Story 3 — Restored session playback (P2)
An editor refreshes the browser while paused at a chosen timestamp and the selected session, video, and analysis state return.

**Independent test**: Open saved session, play to 6 seconds, pause, refresh; selected session and skeleton remain usable without re-uploading.

## Edge Cases
- Video portrait/landscape; canvas resize; mobile Safari.
- Missing, duplicated or non-monotonic timestamps; empty landmarks, NaN/Infinity values.
- Face tracked but no body; partial body cut off by frame.
- Seek to same timestamp, end-of-video, repeated rapid jumps; system under CPU pressure.
- Browser IndexedDB quota or permission unavailable.
- Relative depth must never be labeled calibrated 3D.

## Functional Requirements
- **FR-001**: Synchronize skeleton sample choice with video timestamp; expose timestamp difference.
- **FR-002**: Preserve source landmarks and export unchanged by preview-only transformations.
- **FR-003**: Do not draw inferred joints as reliable when tracking confidence is insufficient.
- **FR-004**: Provide play/pause, orbit controls and optional smoothing comparison.
- **FR-005**: Maintain manual Quality Review decisions and session restoration on F5.
- **FR-006**: Preserve mobile and desktop functionality without server-side media upload.
- **FR-007**: Clearly label reconstruction as experimental 2.5D, not 3D motion capture or character replacement.

## Key Entities
- `PoseSample`: timestamp, 33 normalized landmarks, tracking confidence, detection state.
- `PlaybackState`: source video timestamp, nearest sample timestamp, orbit, smoothing toggle.
- `ReviewDecision`: alert ID and user acceptance/rejection retained by existing QA subsystem.

## Success Criteria
- **SC-001**: 100% deterministic matching of sample indices for fixed timestamp fixtures.
- **SC-002**: No unchanged-session export differences after smoothing is toggled.
- **SC-003**: No uncaught exceptions for rapid-seek and missing-sample fixtures in CI.
- **SC-004**: Manual F5 restoration confirmed in desktop and mobile browsers.
- **SC-005**: Scope excludes claims of measured physical accuracy or full-body model retargeting.

## Assumptions
- Existing browser UI, MediaPipe Pose and IndexedDB session code remain.
- A nominal 5 Hz sample rate is retained for this milestone.
- `main` and Render production remain untouched.

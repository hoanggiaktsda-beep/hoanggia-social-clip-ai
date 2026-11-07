# HOANGGIA VIDEO RECREATOR AI — Constitution

**Version**: 1.0.0 | **Proposed**: 2026-11-07 | **Status**: Proposed for project adoption

Adapted from github/spec-kit core constitution template. This document establishes guardrails for subsequent feature/bug changes; it does not certify that the Specify CLI was installed or run.

## Core Principles

### I. Specification before implementation
Each planned behavior change must reference an issue or a versioned `specs/<feature>/spec.md` defining user scenarios, constraints, acceptance criteria and edge cases. Resolve critical ambiguity before writing production code.

### II. Preserve functioning production
No direct code changes or merges to `main` without explicit approval. Experiment on `feature/video-recreator-motion-v1` or a newly approved feature branch. Avoid modifying currently deployed Render service. Changes to GitHub Pages preview require confirming deployment impact.

### III. Time-series and identity of source data
Always preserve source video and original MediaPipe outputs. The preview is sampled at nominal 5 Hz; it is not 30/60 fps motion capture. Pose `z` is relative and reconstruction is experimental 2.5D rather than calibrated metric 3D. Never overstate transfer accuracy or model-readiness.

### IV. QA and regression are mandatory
Required gates: JavaScript syntax; unit and integration tests; browser-preview checks; repeated-timestamp and missing-data cases; F5/IndexedDB recovery; stale-timestamp and rapid-seek tests. GitHub Actions passing does not replace user browser validation.

### V. Security and privacy
Video and analysis remain local to the browser except when the user explicitly chooses an export. Do not silently upload source media or send personal video to external services. Keep session deletion and transparent storage controls.

### VI. Evidence, traceability, and statuses
Link feature requirements to tasks, tests, commits, CI and preview deployment. Clearly separate proposed, committed, CI-success, deployed and manually verified states. Do not claim a feature complete before relevant evidence exists.

## Change workflow and gates

1. Review repo and applicable Spec Kit methodology/template.
2. Create or update `spec.md` (WHAT/WHY, acceptance and risk).
3. Create or update `plan.md` (HOW, constraints and constitution check).
4. Create or update `tasks.md`, with tests and source locations.
5. Implement on isolated branch only after documents are reviewed. Re-run regression and QA; keep roll-back path.
6. Obtain browser QA and explicit approval before touching production or merging.

For bug fixes, document symptom -> reproduction -> cause hypothesis -> fix scope -> regression evidence. External tools are never presumed installed merely because this project adopts their conventions.

## Governance
Applies prospectively to HOANGGIA VIDEO RECREATOR AI motion-preview changes. Any exception requires a recorded rationale and approval. This constitution is a project-specific adoption of Spec Kit's process and is **not** an assertion of running `specify init` locally.

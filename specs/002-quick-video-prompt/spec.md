# Feature Specification — Quick Video to Prompt V1.0
**Status:** Approved direction from user; implementation experimental.
**Goal:** Upload a clip, analyze, and copy a ready-to-edit Vietnamese Flow prompt. Hide diagnostic panels by default.
**Acceptance:** Primary workflow is upload -> analyze -> editable prompt -> copy. Prompt must contain timed beats, detectable body motion, camera/scene placeholders, and clear uncertainty; never claim optical camera tracking, semantic action recognition, or exact expression when not available. No video upload to server. Advanced analysis remains accessible. Regression test prompt generation and no-data behavior.

# Feature Specification — Quick Video to Prompt V1.0
**Status:** Approved direction from user; implementation experimental.
**Goal:** Upload a clip, analyze, and copy a ready-to-edit Vietnamese Flow prompt. Hide diagnostic panels by default.
**Acceptance:** Primary workflow is upload -> analyze -> editable prompt -> copy. Prompt must contain timed beats, detectable body motion, camera/scene placeholders, and clear uncertainty; never claim optical camera tracking, semantic action recognition, or exact expression when not available. No video upload to server. Advanced analysis remains accessible. Regression test prompt generation and no-data behavior.

## Vision extension (experimental)
User can optionally provide a Gemini API key and explicit consent. The browser sends three compressed still frames directly to Google Gemini to describe visible wardrobe, scene, framing and expression. Never store key or upload the entire video. Without key/consent, output an honest motion-only prompt. Fixed 10s output timeline, never mention source/reference video in generated prompt. Visual descriptions require manual review; never assert exact motion camera calibration.

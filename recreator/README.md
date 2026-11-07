# HOANGGIA VIDEO RECREATOR — Motion Analyzer V1.0 (experimental)

This is a **separate prototype** on `feature/video-recreator-motion-v1`. It does **not** change the live Render app or its Dockerfile.

## Run locally (Python 3.11)
```bash
pip install -r recreator/requirements.txt
python -m recreator.motion_analyzer input.mp4 --out motion-output --sample-fps 5
```
Outputs: `motion.json` (33 normalized body landmarks per sampled frame), `storyboard.json` (histogram-based shot boundaries), and `motion_overlay.mp4` (pose dots). For a lightweight test without MediaPipe: add `--no-pose`.

This is **not** yet an AI video recreation engine. It does not recognize identity, transfer motion, estimate camera paths, or generate video. Pose works best for a single visible person and cannot guarantee tracking through occlusion.

## Deployment boundary
The existing Render service tracks `rebuild-v2-clean`, so this feature branch is **not deployed**. Future API integration requires separate worker, task queue, object storage, limits, and authentication. Do not point Render at this branch until reviewed.

## QA
GitHub Actions runs unit tests and a generated-video integration test. No production claim until CI passes.

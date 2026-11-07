"""HOANGGIA Motion Analyzer V1 — offline, CPU-first; never changes the live API."""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path

def scene_boundaries(signatures, threshold=0.48, min_gap=0.8):
    """Return timestamps of likely cuts using normalized color-histogram distances."""
    cuts=[]
    last=-min_gap
    for (t0,h0),(t1,h1) in zip(signatures,signatures[1:]):
        distance=sum(abs(a-b) for a,b in zip(h0,h1))/2
        if distance>=threshold and t1-last>=min_gap:
            cuts.append(round(t1,3));last=t1
    return cuts

def build_scenes(duration,cuts):
    edges=[0.0]+[t for t in cuts if 0<t<duration]+[duration]
    return [{"scene_id":i+1,"start":round(a,3),"end":round(b,3),"duration":round(b-a,3)}
            for i,(a,b) in enumerate(zip(edges,edges[1:])) if b>a]

def analyze(input_path,output_dir,sample_fps=5.0,with_pose=True):
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Install opencv-python-headless before analyzing") from exc
    source=Path(input_path)
    if not source.is_file(): raise FileNotFoundError(source)
    out=Path(output_dir);out.mkdir(parents=True,exist_ok=True)
    cap=cv2.VideoCapture(str(source))
    if not cap.isOpened():raise ValueError("Video cannot be decoded")
    fps=float(cap.get(cv2.CAP_PROP_FPS))
    frames=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if not (math.isfinite(fps) and fps>0 and width>0 and height>0):
        cap.release();raise ValueError("Invalid video metadata")
    duration=frames/fps
    if duration>300:cap.release();raise ValueError("V1 limit: 300 seconds")
    pose=None
    if with_pose:
        try:
            import mediapipe as mp
            pose=mp.solutions.pose.Pose(static_image_mode=False,model_complexity=1,
                enable_segmentation=False,min_detection_confidence=.5,
                min_tracking_confidence=.5)
        except (ImportError,AttributeError) as exc:
            cap.release()
            raise RuntimeError("MediaPipe Pose unavailable; install pinned requirements or use --no-pose") from exc
    writer=None;signatures=[];samples=[];last_sample=-1
    stride=max(1,round(fps/max(0.2,min(sample_fps,15))))
    try:
        for index in range(frames):
            ok,frame=cap.read()
            if not ok:break
            if index%stride:continue
            t=round(index/fps,3)
            small=cv2.resize(frame,(64,64))
            hist=cv2.calcHist([small],[0,1,2],None,[8,8,8],[0,256]*3)
            hist=cv2.normalize(hist,hist,norm_type=cv2.NORM_L1).flatten().tolist()
            signatures.append((t,hist))
            points=[]
            if pose is not None:
                rgb=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
                result=pose.process(rgb)
                if result.pose_landmarks:
                    for j,p in enumerate(result.pose_landmarks.landmark):
                        points.append({"id":j,"x":round(p.x,5),"y":round(p.y,5),
                            "z":round(p.z,5),"visibility":round(p.visibility,4)})
                        if p.visibility>.4:
                            cv2.circle(frame,(int(p.x*width),int(p.y*height)),3,(0,220,255),-1)
            samples.append({"time":t,"pose_detected":bool(points),"landmarks":points})
            if writer is None:
                fourcc=cv2.VideoWriter_fourcc(*"mp4v")
                writer=cv2.VideoWriter(str(out/"motion_overlay.mp4"),fourcc,
                    max(.2,min(sample_fps,fps)),(width,height))
                if not writer.isOpened():raise RuntimeError("Cannot initialize annotated video")
            writer.write(frame)
    finally:
        cap.release()
        if writer is not None:writer.release()
        if pose is not None:pose.close()
    if not samples:raise ValueError("No decodable frames")
    cuts=scene_boundaries(signatures)
    scenes=build_scenes(duration,cuts)
    for scene in scenes:
        subset=[s for s in samples if scene["start"]<=s["time"]<scene["end"]]
        scene["sample_count"]=len(subset)
        scene["pose_detection_rate"]=round(sum(s["pose_detected"] for s in subset)/max(1,len(subset)),3)
        scene["description"]="Chưa có mô hình ngôn ngữ thị giác; chỉ phát hiện chuyển cảnh và pose."
    result={"schema_version":"1.0","source":source.name,
        "video":{"duration":round(duration,3),"fps":round(fps,3),"width":width,"height":height},
        "sampling_fps":round(fps/stride,3),"pose_enabled":with_pose,
        "landmark_format":"MediaPipe Pose 33 landmarks, normalized image coordinates",
        "scene_cuts":cuts,"scenes":scenes,"frames":samples,
        "limitations":["Single-person pose estimation","No identity recognition",
                       "No camera-motion estimation","No video generation"]}
    (out/"motion.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    (out/"storyboard.json").write_text(json.dumps({"scenes":scenes},ensure_ascii=False,indent=2),encoding="utf-8")
    return result

def main():
    parser=argparse.ArgumentParser(description="HOANGGIA Video Recreator — Motion Analyzer V1")
    parser.add_argument("video");parser.add_argument("--out",default="motion-output")
    parser.add_argument("--sample-fps",type=float,default=5.0)
    parser.add_argument("--no-pose",action="store_true")
    args=parser.parse_args()
    result=analyze(args.video,args.out,args.sample_fps,not args.no_pose)
    print(json.dumps({"scenes":len(result["scenes"]),"samples":len(result["frames"]),
        "output":args.out},ensure_ascii=False))
if __name__=="__main__":main()

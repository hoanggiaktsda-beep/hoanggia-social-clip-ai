// V1.5 transfer-ready analysis package; preserves source samples and avoids claims of 3D motion.
export function assessTransferReadiness(report){
 if(!report||!Array.isArray(report.face_tracking?.frames)||!Array.isArray(report.frames))throw Error('Missing motion frames');
 const faces=report.face_tracking.frames, hands=report.hand_tracking?.frames||[];
 const faceValid=faces.filter(f=>f.detected&&Array.isArray(f.landmarks)&&f.landmarks.length>=468).length;
 const faceCoverage=faces.length?faceValid/faces.length:0;
 const duplicateHands=hands.flatMap((f,i)=>(f.hands?.length||0)>2?[{index:i,time:f.time??faces[i]?.time??null,count:f.hands.length}]:[]);
 const flags=report.motion_quality?.flags||[];
 const limb=report.limb_tracking||{};
 const insufficientLimbs=Object.entries(limb).filter(([,v])=>Number(v.tracking_rate)<.5).map(([name])=>name);
 const blockers=[];
 if(faceCoverage<.9)blockers.push('face_coverage_below_90_percent');
 if(duplicateHands.length)blockers.push('more_than_two_hands_detected');
 return {status:blockers.length?'review_required':'facial_2d_ready',
  face_coverage:+faceCoverage.toFixed(4),face_valid:faceValid,face_total:faces.length,
  duplicate_hand_frames:duplicateHands,abrupt_change_count:flags.length,
  flagged_times:flags.map(f=>f.time),insufficient_limbs:insufficientLimbs,
  blockers,requires_manual_review:flags.length>0||duplicateHands.length>0,
  full_body_transfer_ready:false,video_generation_ready:false,
  note:'2D landmark readiness only; no identity, camera, 3D or visual fidelity validation.'};
}
export function transferPackage(report){
 if(!report||!Array.isArray(report.frames)||!Array.isArray(report.face_tracking?.frames))throw Error('Missing motion frames');
 const faces=report.face_tracking.frames,hands=report.hand_tracking?.frames||[],body=report.frames;
 const duration=Number(report.video?.duration)||0;
 const samples=faces.map((f,i)=>({
  time:f.time,face:f.detected?f.landmarks:null,
  hands:(hands[i]?.hands||[]).slice(0,2),pose:body[i]?.pose_detected?body[i].landmarks:null,
  facial_2d:report.facial_motion?.metrics?.[i]||null,
  warnings:(report.motion_quality?.flags||[]).filter(w=>w.index===i).map(w=>({metric:w.metric,delta:w.delta}))
 }));
 return {schema:'hoanggia.motion-transfer.v1',source:{filename:report.source,duration_seconds:duration,width:report.video?.width,height:report.video?.height},
  sampling_fps:report.sampling_target_fps||5,coordinate_system:'image_normalized_xy',samples,readiness:assessTransferReadiness(report),
  quality:{face_valid:faces.filter(f=>f.detected).length,total:faces.length,flagged:(report.motion_quality?.flags||[]).length},
  constraints:{identity_transfer:false,video_generation:false,head_pose_3d:false,camera_tracking:false},
  note:'Landmarks and 2D ratios only. Source motion is unchanged; downstream model adapter not connected.'};
}
export function classifyChanges(metrics,flags){
 return flags.map(flag=>{
  const i=flag.index,k=flag.metric;
  const a=metrics[i-1]?.[k],b=metrics[i]?.[k],c=metrics[i+1]?.[k];
  const isolated=[a,b,c].every(Number.isFinite)&&Math.abs(a-c)<Math.abs(b-a)*.35;
  return {...flag,review_hint:isolated?'possible_single_frame_spike':'motion_or_tracking_requires_review'};
 });
}

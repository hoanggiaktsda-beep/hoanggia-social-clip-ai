// Pure, deterministic timestamp selection and preview-only smoothing.
// Source sample arrays and landmark objects must never be mutated.
export function selectSample(frames,time,tolerance=.12){
 if(!Array.isArray(frames)||!Number.isFinite(time)||!Number.isFinite(tolerance)||tolerance<0)return null;
 let index=-1,delta=Infinity;
 frames.forEach((frame,i)=>{
  const stamp=frame?.time;
  if(typeof stamp!=='number'||!Number.isFinite(stamp))return;
  const d=Math.abs(stamp-time);
  if(d<delta){delta=d;index=i}
 });
 return index>=0&&delta<=tolerance?{frame:frames[index],index,delta}:null;
}
export function smoothPose(frames,index,radius=1,threshold=.6){
 const frame=frames?.[index];
 if(!Array.isArray(frame?.landmarks)||frame.landmarks.length!==33)return frame??null;
 const landmarks=frame.landmarks.map((point,id)=>{
  if(!point)return point;
  const confidence=Number(point.visibility);
  if(!Number.isFinite(confidence)||confidence<threshold)return {...point};
  const valid=[];
  for(let i=Math.max(0,index-radius);i<=Math.min(frames.length-1,index+radius);i++){
   const candidate=frames[i]?.landmarks?.[id];
   if(!candidate||Number(candidate.visibility)<threshold)continue;
   if(!['x','y','z'].every(k=>typeof candidate[k]==='number'&&Number.isFinite(candidate[k])))continue;
   valid.push(candidate);
  }
  if(valid.length<2)return {...point};
  const median=key=>valid.map(p=>p[key]).sort((a,b)=>a-b)[Math.floor(valid.length/2)];
  return {...point,x:median('x'),y:median('y'),z:median('z')};
 });
 return {...frame,landmarks};
}

// V1.6.2: conservative hand overlap heuristic. Never discard source landmarks.
export function handAnomalies(report){
 const frames=report?.hand_tracking?.frames||[];
 return frames.flatMap((frame,index)=>{
  const hands=frame.hands||[];
  if(hands.length<=2)return [];
  const center=h=>{const p=h.landmarks||h.points||[];const wrist=p[0];return wrist&&Number.isFinite(wrist.x)&&Number.isFinite(wrist.y)?{x:wrist.x,y:wrist.y}:null};
  const candidates=[];
  for(let i=0;i<hands.length;i++)for(let j=i+1;j<hands.length;j++){
   const a=center(hands[i]),b=center(hands[j]);if(!a||!b)continue;
   const distance=Math.hypot(a.x-b.x,a.y-b.y);
   if(distance<.055)candidates.push({first:i,second:j,wrist_distance:+distance.toFixed(4)});
  }
  return [{index,time:frame.time??null,detected_count:hands.length,
   suspected_duplicates:candidates,classification:candidates.length?'possible_duplicate':'unresolved_extra_detection'}];
 });
}
export function reviewStorageKey(report){
 const source=String(report?.source||'unknown');
 const duration=Number(report?.video?.duration||0).toFixed(3);
 const dims=[report?.video?.width,report?.video?.height].join('x');
 const frames=report?.face_tracking?.frames||[];
 const signature=frames.map(f=>[Number(f.time||0).toFixed(2),Number(f.landmarks?.[1]?.x||0).toFixed(4),Number(f.landmarks?.[1]?.y||0).toFixed(4)].join(':')).join('|');
 const raw=[source,duration,dims,frames.length,signature].join('~');
 let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619)}
 return 'hoanggia-motion-review-v162-'+(hash>>>0).toString(16);
}
export function restoreReview(storage,report,items){
 try{
  const obj=JSON.parse(storage.getItem(reviewStorageKey(report))||'null');
  if(obj?.version!==1||!obj.decisions)return {};
  const ids=new Set(items.map(x=>x.id));
  return Object.fromEntries(Object.entries(obj.decisions).filter(([id,v])=>ids.has(id)&&['accepted','rejected'].includes(v)));
 }catch{return {}}
}
export function saveReview(storage,report,decisions){
 try{storage.setItem(reviewStorageKey(report),JSON.stringify({version:1,decisions,updated_at:new Date().toISOString()}));return true}catch{return false}
}

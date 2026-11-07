// V1.4: robust local quality flags and non-destructive median preview.
// Smoothed metrics never replace original motion or landmark data.
export const KEYS=['mouth_open','left_eye_open','right_eye_open','head_x','head_y','yaw_proxy'];
export function qualityAnalysis(metrics,{threshold=0.25,window=3}={}){
 const n=metrics.length;
 const flags=[],cleaned=metrics.map(m=>m?{...m}:null);
 const odd=Math.max(1,Math.floor(window)|1),radius=Math.floor(odd/2);
 for(const key of KEYS){
  const vals=metrics.map(m=>m&&Number.isFinite(m[key])?m[key]:null);
  for(let i=1;i<n;i++){
   if(vals[i]===null||vals[i-1]===null)continue;
   const delta=Math.abs(vals[i]-vals[i-1]);
   if(delta>threshold)flags.push({time:metrics[i].time,index:i,metric:key,delta:+delta.toFixed(4),type:'abrupt_change_unverified'});
  }
  // A median filter removes isolated spikes but keeps originals available.
  for(let i=0;i<n;i++){
   if(vals[i]===null)continue;
   const neighborhood=[];
   for(let j=Math.max(0,i-radius);j<=Math.min(n-1,i+radius);j++){
    if(vals[j]!==null)neighborhood.push(vals[j]);
   }
   neighborhood.sort((a,b)=>a-b);
   if(neighborhood.length>=3)cleaned[i][key]=neighborhood[Math.floor(neighborhood.length/2)];
  }
 }
 const missing=[];let start=-1;
 for(let i=0;i<=n;i++){
  const absent=i<n&&metrics[i]===null;
  if(absent&&start<0)start=i;
  if(!absent&&start>=0){missing.push({start_index:start,end_index:i-1,
   start_time:metrics.slice(0,start).reverse().find(Boolean)?.time??null,
   next_valid_time:metrics.slice(i).find(Boolean)?.time??null});start=-1}
 }
 return {algorithm:'median3_non_destructive',threshold,original:metrics,preview_smoothed:cleaned,
   flags,missing_ranges:missing,valid_frames:metrics.filter(Boolean).length,total_frames:n,
   note:'Abrupt changes are candidates for review, not confirmed tracking errors.'};
}

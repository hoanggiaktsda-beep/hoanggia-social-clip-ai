// Normalized facial ratios and frame-to-frame motion. No identity or emotion classification.
export function distance(a,b){return a&&b?Math.hypot(a.x-b.x,a.y-b.y):null}
export function facialMetrics(points){
 if(!points||points.length<468)return null;
 const d=(i,j)=>distance(points[i],points[j]);
 const scale=d(33,263);
 if(!scale||scale<.001)return null;
 const ratio=(a,b)=>+(a/b).toFixed(4);
 return {time:null,
   mouth_open:ratio(d(13,14),scale),
   left_eye_open:ratio(d(159,145),d(33,133)||scale),
   right_eye_open:ratio(d(386,374),d(362,263)||scale),
   head_x:+((points[1].x-(points[33].x+points[263].x)/2)/scale).toFixed(4),
   head_y:+((points[1].y-(points[33].y+points[263].y)/2)/scale).toFixed(4),
   // 2D relative motion proxy; NOT 3D head-pose angles.
   yaw_proxy:ratio(d(1,33)-d(1,263),scale)
 };
}
export function buildTimeline(frames){
 const metrics=frames.map(f=>{const m=facialMetrics(f.landmarks);return m?{...m,time:f.time}:null});
 const keys=['mouth_open','left_eye_open','right_eye_open','head_x','head_y','yaw_proxy'];
 const summary={};
 for(const key of keys){
   const values=metrics.filter(Boolean).map(m=>m[key]).filter(Number.isFinite);
   let jumpCount=0;
   for(let i=1;i<metrics.length;i++){
     if(!metrics[i]||!metrics[i-1])continue;
     if(Math.abs(metrics[i][key]-metrics[i-1][key])>.25)jumpCount++;
   }
   summary[key]={samples:values.length,min:values.length?Math.min(...values):null,
     max:values.length?Math.max(...values):null,jump_count:jumpCount};
 }
 return {metrics,summary,valid_frames:metrics.filter(Boolean).length};
}

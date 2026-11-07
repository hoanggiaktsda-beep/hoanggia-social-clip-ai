// V1.7.0 experimental 2.5D pose visualization. MediaPipe relative z is NOT metric depth.
export const BONES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
export function reconstructPose(frame){
 const lm=frame?.landmarks||[];
 if(lm.length!==33)return {points:[],bones:[],coverage:0,status:'no_pose'};
 const points=lm.map((p,id)=>({id,x:(Number(p.x)-.5)*2,y:(.5-Number(p.y))*2,z:Number.isFinite(Number(p.z))?-Number(p.z):0,confidence:Number(p.visibility)||0}));
 const bones=BONES.filter(([a,b])=>points[a].confidence>=.6&&points[b].confidence>=.6);
 const coverage=points.filter(p=>p.confidence>=.6).length/33;
 return {points,bones,coverage,status:coverage>=.65?'experimental':'low_confidence'};
}
export function renderSkeleton(canvas,frame,angle=25){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0c1915';ctx.fillRect(0,0,w,h);
 const pose=reconstructPose(frame),theta=angle*Math.PI/180;
 const project=p=>({x:w/2+(p.x*Math.cos(theta)+p.z*Math.sin(theta))*w*.32,y:h/2-p.y*h*.42});
 ctx.strokeStyle='#354e45';ctx.lineWidth=1;
 for(let i=-4;i<=4;i++){const x=w/2+i*w*.08;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
 ctx.lineWidth=3;ctx.strokeStyle='#d9b876';
 for(const [a,b] of pose.bones){const p=project(pose.points[a]),q=project(pose.points[b]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke()}
 for(const p of pose.points){if(p.confidence<.6)continue;const q=project(p);ctx.fillStyle=p.confidence>=.8?'#5ee3ac':'#f5cf77';ctx.beginPath();ctx.arc(q.x,q.y,3.5,0,Math.PI*2);ctx.fill()}
 ctx.font='13px sans-serif';ctx.fillStyle='#f5dfac';ctx.fillText('ƯỚC LƯỢNG 2.5D · KHÔNG PHẢI 3D ĐO ĐẠC',12,22);
 return pose;
}

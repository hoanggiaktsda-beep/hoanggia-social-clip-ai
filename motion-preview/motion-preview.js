const $=id=>document.getElementById(id);
const video=$('video'),canvas=$('overlay'),ctx=canvas.getContext('2d');
const state=msg=>{$('state').textContent=msg};
let url=null,running=false,samples=[],pose=null,face=null,hands=null,sourceName='',faceSamples=[],handSamples=[],latestFace=[],latestHands=[];
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
function syncOverlay(){
 const rect=video.getBoundingClientRect(),parent=$('viewer').getBoundingClientRect();
 canvas.style.left=(rect.left-parent.left)+'px';canvas.style.top=(rect.top-parent.top)+'px';
 canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';
}
window.addEventListener('resize',syncOverlay);
video.addEventListener('loadedmetadata',syncOverlay);
function visible(p){return !!p&&p.visibility>=.6&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1}
function draw(landmarks){
 syncOverlay();
 const w=canvas.width=video.videoWidth||640,h=canvas.height=video.videoHeight||360;
 ctx.clearRect(0,0,w,h);
 if(!$('show').checked||!landmarks){drawExtra();return}
 ctx.lineWidth=Math.max(2,w/320);ctx.strokeStyle='#e9bb68';ctx.fillStyle='#66edbc';
 for(const [a,b] of EDGES){const p=landmarks[a],q=landmarks[b];if(visible(p)&&visible(q)){ctx.beginPath();ctx.moveTo(p.x*w,p.y*h);ctx.lineTo(q.x*w,q.y*h);ctx.stroke()}}
 for(const p of landmarks){if(!visible(p))continue;ctx.beginPath();ctx.arc(p.x*w,p.y*h,Math.max(2,w/320),0,Math.PI*2);ctx.fill()}
 drawExtra();
}
function drawExtra(){
 const w=canvas.width,h=canvas.height;
 if($('showFace').checked){ctx.fillStyle='#7be8ff';for(const p of latestFace){if(p.x<0||p.x>1||p.y<0||p.y>1)continue;ctx.fillRect(p.x*w-1,p.y*h-1,2,2)}}
 if($('showHands').checked){ctx.fillStyle='#ff8ac2';for(const hand of latestHands){for(const p of hand.landmarks){if(p.x<0||p.x>1||p.y<0||p.y>1)continue;ctx.beginPath();ctx.arc(p.x*w,p.y*h,2.5,0,Math.PI*2);ctx.fill()}}}
}
$('file').onchange=()=>{
 running=false;if(url)URL.revokeObjectURL(url);
 const file=$('file').files?.[0];if(!file)return;
 sourceName=file.name;url=URL.createObjectURL(file);video.src=url;
 samples=[];faceSamples=[];handSamples=[];latestFace=[];latestHands=[];$('json').disabled=true;$('analyze').disabled=false;
 state('Video đã chọn. Nhấn Phân tích video.');$('stats').textContent='Chưa phân tích.';
};
$('stop').onclick=()=>{running=false;video.pause();state('Đã dừng phân tích.')};
async function ensureExtra(){
 if(!face){if(typeof window.FaceMesh!=='function')throw Error('Không tải được Face Mesh');face=new window.FaceMesh({locateFile:file=>'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/'+file});face.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.5,minTrackingConfidence:.5});face.onResults(r=>{latestFace=(r.multiFaceLandmarks?.[0]||[]).map(p=>({x:+p.x.toFixed(5),y:+p.y.toFixed(5),z:+p.z.toFixed(5)}));faceSamples.push({time:+video.currentTime.toFixed(3),detected:latestFace.length>0,landmarks:latestFace})})}
 if(!hands){if(typeof window.Hands!=='function')throw Error('Không tải được Hands');hands=new window.Hands({locateFile:file=>'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/'+file});hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.5,minTrackingConfidence:.5});hands.onResults(r=>{latestHands=(r.multiHandLandmarks||[]).map((points,i)=>({label:r.multiHandedness?.[i]?.label||'Unknown',score:r.multiHandedness?.[i]?.score||null,landmarks:points.map(p=>({x:+p.x.toFixed(5),y:+p.y.toFixed(5),z:+p.z.toFixed(5)}))}));handSamples.push({time:+video.currentTime.toFixed(3),hands:latestHands})})}
}
async function ensurePose(){
 if(pose)return pose;
 if(typeof window.Pose!=='function')throw Error('Không tải được MediaPipe từ CDN.');
 pose=new window.Pose({locateFile:file=>'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/'+file});
 pose.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:.5,minTrackingConfidence:.5});
 pose.onResults(result=>{
   const lm=result.poseLandmarks||[];
   const landmarks=lm.map((p,i)=>({id:i,x:+p.x.toFixed(5),y:+p.y.toFixed(5),z:+p.z.toFixed(5),visibility:+p.visibility.toFixed(4)}));
   samples.push({time:+video.currentTime.toFixed(3),pose_detected:landmarks.length===33,landmarks});
   draw(landmarks);
 });
 return pose;
}
function seekTo(t){
 return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{cleanup();reject(Error('Không thể tua video'))},10000);
   function cleanup(){clearTimeout(timeout);video.removeEventListener('seeked',done);video.removeEventListener('error',failed)}
   function done(){cleanup();resolve()}
   function failed(){cleanup();reject(Error('Lỗi giải mã video'))}
   video.addEventListener('seeked',done,{once:true});video.addEventListener('error',failed,{once:true});
   video.currentTime=t;
 });
}
$('analyze').onclick=async()=>{
 if(running)return;
 if(!Number.isFinite(video.duration)||video.duration<=0){state('Chờ video tải xong metadata.');return}
 if(video.duration>120){state('Bản preview giới hạn video tối đa 120 giây.');return}
 running=true;samples=[];$('analyze').disabled=true;$('stop').disabled=false;$('json').disabled=true;
 try{
   await ensurePose();await ensureExtra();video.pause();
   const count=Math.min(600,Math.ceil(video.duration*5));
   for(let i=0;i<count&&running;i++){
     const t=Math.min(video.duration-.02,i/5);
     if(t<0)break;
     if(Math.abs(video.currentTime-t)>.025)await seekTo(t);
     if(!running)break;
     await pose.send({image:video});
     await face.send({image:video});
     await hands.send({image:video});
     draw(samples.at(-1)?.landmarks||[]);
     if(i%5===0)state('Đang phân tích '+Math.round(100*(i+1)/count)+'% · '+samples.length+' mẫu');
   }
   const detected=samples.filter(x=>x.pose_detected).length;
   const limbs={left_arm:[11,13,15],right_arm:[12,14,16],left_leg:[23,25,27],right_leg:[24,26,28]};
   const limbStats={};
   for(const [name,ids] of Object.entries(limbs)){
     const values=samples.map(s=>ids.map(id=>visible(s.landmarks[id])?s.landmarks[id].visibility:0));
     const present=values.filter(v=>v.every(x=>x>=.5)).length;
     limbStats[name]={tracked_frames:present,tracking_rate:samples.length?+(present/samples.length).toFixed(3):0,
       mean_visibility:values.length?+(values.reduce((sum,v)=>sum+v.reduce((a,b)=>a+b,0)/ids.length,0)/values.length).toFixed(3):0};
   }
   const motionSeries=[];
   for(let i=1;i<samples.length;i++){
     const a=samples[i-1],b=samples[i],dt=b.time-a.time;
     if(dt<=0)continue;
     const velocity={time:b.time};
     for(const [name,ids] of Object.entries(limbs)){
       const values=ids.map(id=>{
         const p=a.landmarks[id],q=b.landmarks[id];
         if(!visible(p)||!visible(q))return null;
         return Math.hypot(q.x-p.x,q.y-p.y)/dt;
       }).filter(v=>v!==null);
       velocity[name]=values.length===ids.length?+(values.reduce((x,y)=>x+y,0)/values.length).toFixed(4):null;
     }
     motionSeries.push(velocity);
   }
   const motionSummary={};
   for(const name of Object.keys(limbs)){
     const values=motionSeries.map(v=>v[name]).filter(v=>v!==null);
     motionSummary[name]={mean_normalized_speed_per_second:values.length?+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(4):null,
       peak_normalized_speed_per_second:values.length?+Math.max(...values).toFixed(4):null,
       valid_motion_intervals:values.length};
   }
   const limbNames={left_arm:'Tay trái',right_arm:'Tay phải',left_leg:'Chân trái',right_leg:'Chân phải'};
   $('limbMetrics').textContent=Object.entries(limbStats).map(([name,v])=>limbNames[name]+': '+(v.tracking_rate<.05?'Không đủ dữ liệu (ngoài khung hình/che khuất)':Math.round(v.tracking_rate*100)+'% khung hình · tin cậy '+v.mean_visibility+' · tốc độ TB '+(motionSummary[name].mean_normalized_speed_per_second??'N/A'))).join('\n');
   const faceDetected=faceSamples.filter(x=>x.detected).length;
   const handDetected=handSamples.filter(x=>x.hands.length>0).length;
   $('faceHandMetrics').textContent='Khuôn mặt: '+faceDetected+'/'+faceSamples.length+' mẫu · Bàn tay: '+handDetected+'/'+handSamples.length+' mẫu. Điểm mặt và tay được xuất trong JSON.';
   const report={schema_version:'1.2-browser-preview',source:sourceName,
     video:{duration:video.duration,width:video.videoWidth,height:video.videoHeight},
     sampling_target_fps:5,face_tracking:{detected_frames:faceDetected,total_frames:faceSamples.length,frames:faceSamples},hand_tracking:{detected_frames:handDetected,total_frames:handSamples.length,frames:handSamples},limb_tracking:limbStats,motion_summary:motionSummary,motion_timeseries:motionSeries,frames:samples,
     limitations:['Single-person pose only','Browser-based processing','No camera tracking','No AI generation']};
   window.motionReport=report;
   $('stats').textContent=JSON.stringify({duration_seconds:+video.duration.toFixed(2),
     samples:samples.length,pose_detected:detected,
     detection_rate:samples.length?+(detected/samples.length).toFixed(3):0,
     dimensions:video.videoWidth+'×'+video.videoHeight},null,2);
   $('json').disabled=!samples.length;
   state(running?'Phân tích hoàn tất. Có thể tải motion.json.':'Đã dừng. Kết quả một phần có thể tải.');
 }catch(e){state('Không phân tích được: '+e.message)}
 finally{running=false;$('stop').disabled=true;$('analyze').disabled=false}
};
$('json').onclick=()=>{
 if(!window.motionReport)return;
 const blob=new Blob([JSON.stringify(window.motionReport,null,2)],{type:'application/json'});
 const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='HOANGGIA-motion.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(link.href),3000);
};
$('show').onchange=()=>{if(!$('show').checked)ctx.clearRect(0,0,canvas.width,canvas.height)};
window.addEventListener('pagehide',()=>{running=false;if(url)URL.revokeObjectURL(url);pose?.close();face?.close();hands?.close()});

for(const id of ['showFace','showHands'])$(id).addEventListener('change',()=>draw(samples.at(-1)?.landmarks||[]));

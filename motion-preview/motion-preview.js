import {selectSample,smoothPose} from './motion-sampling.js';
import {renderSkeleton} from './motion-reconstruction.js';
import {buildTimeline} from './facial-metrics.js';
import {qualityAnalysis} from './motion-quality.js';
import {transferPackage,classifyChanges} from './transfer-package.js';
import {reviewItems,reviewedPackage} from './quality-review.js';
import {restoreReview,saveReview,handAnomalies} from './hand-quality.js';
import {saveSession,loadSession,clearSession,saveReport,listSessions,selectSession,deleteSession,savePosition} from './session-store.js';
const $=id=>document.getElementById(id);
const video=$('video'),canvas=$('overlay'),ctx=canvas.getContext('2d');
const state=msg=>{$('state').textContent=msg};
let timelineData=null,qualityData=null;
let reviewDecisions={};
let activeFile=null,url=null,running=false,samples=[],pose=null,face=null,hands=null,sourceName='',faceSamples=[],handSamples=[],latestFace=[],latestHands=[];
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
function syncOverlay(){
 const rect=video.getBoundingClientRect(),parent=$('viewer').getBoundingClientRect();
 canvas.style.left=(rect.left-parent.left)+'px';canvas.style.top=(rect.top-parent.top)+'px';
 canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';
}
window.addEventListener('resize',syncOverlay);
video.addEventListener('loadedmetadata',syncOverlay);
function visible(p){return !!p&&p.visibility>=.6&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1}
const JOINT_NAMES={11:'Vai trái',12:'Vai phải',13:'Khuỷu trái',14:'Khuỷu phải',15:'Cổ tay trái',16:'Cổ tay phải',23:'Hông trái',24:'Hông phải',25:'Gối trái',26:'Gối phải',27:'Cổ chân trái',28:'Cổ chân phải'};
let displayedPose=[],selectedJoint=null;
function jointConfidence(p){return Number.isFinite(Number(p?.visibility))?Number(p.visibility):0}
function jointColor(p){
 if(!p||p.x<0||p.x>1||p.y<0||p.y>1)return '#ff6976';
 return jointConfidence(p)>=.8?'#54e6a1':jointConfidence(p)>=.6?'#ffd078':'#ff6976';
}
function draw(landmarks){
 syncOverlay();
 const w=canvas.width=video.videoWidth||640,h=canvas.height=video.videoHeight||360;
 ctx.clearRect(0,0,w,h);
 displayedPose=Array.isArray(landmarks)?landmarks:[];
 if(!$('show').checked||!displayedPose.length){drawExtra();return}
 const colorized=$('jointColors').checked;
 ctx.lineWidth=Math.max(2,w/320);ctx.strokeStyle='#e9bb68';ctx.fillStyle='#66edbc';
 for(const [a,b] of EDGES){const p=displayedPose[a],q=displayedPose[b];if(visible(p)&&visible(q)){ctx.beginPath();ctx.moveTo(p.x*w,p.y*h);ctx.lineTo(q.x*w,q.y*h);ctx.stroke()}}
 displayedPose.forEach((p,id)=>{
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
  if(p.x<0||p.x>1||p.y<0||p.y>1)return;
  if(!colorized&&!visible(p))return;
  const x=p.x*w,y=p.y*h,r=Math.max(3,w/240);
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  if(colorized&&!visible(p)){ctx.strokeStyle='#ff6976';ctx.lineWidth=Math.max(2,w/400);ctx.stroke();ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);ctx.moveTo(x+r,y-r);ctx.lineTo(x-r,y+r);ctx.stroke()}
  else{ctx.fillStyle=colorized?jointColor(p):'#66edbc';ctx.fill()}
  if(selectedJoint===id){ctx.beginPath();ctx.arc(x,y,r+Math.max(3,w/200),0,Math.PI*2);ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.stroke()}
 });
 drawExtra();
}
canvas.addEventListener('click',event=>{
 if(!$('show').checked||!displayedPose.length)return;
 const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
 let best=-1,distance=Infinity;
 displayedPose.forEach((p,id)=>{
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)return;
  const d=Math.hypot((p.x-x)*rect.width,(p.y-y)*rect.height);
  if(d<distance){best=id;distance=d}
 });
 if(best<0||distance>Math.max(16,rect.width*.025))return;
 selectedJoint=best;const p=displayedPose[best],confidence=jointConfidence(p);
 $('jointSelection').textContent=(JOINT_NAMES[best]||'Điểm khớp '+best)+' (#'+best+') · x='+p.x.toFixed(4)+' · y='+p.y.toFixed(4)+' · visibility='+confidence.toFixed(3)+' · '+(visible(p)?'Được phát hiện rõ':'Độ tin cậy thấp hoặc ngoài khung (không khẳng định bị che khuất)');
 draw(displayedPose);
});
$('jointColors').addEventListener('change',()=>draw(displayedPose));
function drawExtra(){
 const w=canvas.width,h=canvas.height;
 if($('showFace').checked){ctx.fillStyle='#7be8ff';for(const p of latestFace){if(p.x<0||p.x>1||p.y<0||p.y>1)continue;ctx.fillRect(p.x*w-1,p.y*h-1,2,2)}}
 if($('showHands').checked){ctx.fillStyle='#ff8ac2';for(const hand of latestHands){for(const p of hand.landmarks){if(p.x<0||p.x>1||p.y<0||p.y>1)continue;ctx.beginPath();ctx.arc(p.x*w,p.y*h,2.5,0,Math.PI*2);ctx.fill()}}}
}
$('file').onchange=async()=>{
 running=false;if(url)URL.revokeObjectURL(url);
 const file=$('file').files?.[0];if(!file)return;
 sourceName=file.name;activeFile=file;url=URL.createObjectURL(file);video.src=url;
 try{await saveSession(file);await renderSessions();$('sessionStatus').textContent='Đã lưu video trên thiết bị; có thể tải lại trang.'}catch(e){$('sessionStatus').textContent='Không lưu được video: '+e.message+' — hãy giữ bản gốc.'}
 samples=[];faceSamples=[];handSamples=[];latestFace=[];latestHands=[];selectedJoint=null;$('jointSelection').textContent='Chưa chọn điểm khớp.';timelineData=null;qualityData=null;reviewDecisions={};$('reviewList').replaceChildren();$('reviewExport').disabled=true;$('reviewStatus').textContent='Chưa có dữ liệu phân tích.';$('reviewReadiness').textContent='';$('transfer').disabled=true;$('reviewButtons').replaceChildren();$('qualityFlags').textContent='Chưa đánh giá chất lượng.';$('smooth').checked=false;$('frameSlider').disabled=true;$('facialSummary').textContent='Chưa có dữ liệu khuôn mặt.';$('json').disabled=true;$('analyze').disabled=false;
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
  if(!Number.isFinite(t)){reject(Error('Mốc thời gian không hợp lệ'));return}
  const duration=Number(video.duration);
  const target=Math.max(0,Number.isFinite(duration)?Math.min(t,Math.max(0,duration-.001)):t);
  if(!video.seeking&&Math.abs(video.currentTime-target)<.001){resolve();return}
  let settled=false;
  const timeout=setTimeout(()=>finish(Error('Không thể tua video')),10000);
  function cleanup(){clearTimeout(timeout);video.removeEventListener('seeked',done);video.removeEventListener('error',failed)}
  function finish(error){if(settled)return;settled=true;cleanup();error?reject(error):resolve()}
  function done(){finish()}
  function failed(){finish(Error('Lỗi giải mã video'))}
  video.addEventListener('seeked',done);
  video.addEventListener('error',failed);
  try{video.currentTime=target}catch(e){finish(e)}
 });
}

$('analyze').onclick=async()=>{
 if(running)return;
 if(!Number.isFinite(video.duration)||video.duration<=0){state('Chờ video tải xong metadata.');return}
 if(video.duration>120){state('Bản preview giới hạn video tối đa 120 giây.');return}
 running=true;samples=[];faceSamples=[];handSamples=[];latestFace=[];latestHands=[];$('analyze').disabled=true;$('stop').disabled=false;$('json').disabled=true;
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
   timelineData=buildTimeline(faceSamples);
   qualityData=qualityAnalysis(timelineData.metrics);
   renderTimeline(timelineData);
   $('qualityFlags').textContent='Cảnh báo biến thiên đột ngột: '+qualityData.flags.length+' · Khoảng thiếu dữ liệu: '+qualityData.missing_ranges.length+'\n'+qualityData.flags.slice(0,24).map(f=>f.time.toFixed(2)+'s · '+f.metric+' · Δ='+f.delta).join('\n');
   const reviewed=classifyChanges(timelineData.metrics,qualityData.flags);
   const reviewBox=$('reviewButtons');reviewBox.replaceChildren();
   for(const flag of reviewed.slice(0,30)){
     const btn=document.createElement('button');btn.type='button';btn.textContent=flag.time.toFixed(2)+'s · '+flag.metric+(flag.review_hint==='possible_single_frame_spike'?' · nghi nhiễu':' · cần xem');
     btn.addEventListener('click',()=>{const slider=$('frameSlider');slider.value=String(flag.index);slider.dispatchEvent(new Event('input'))});reviewBox.appendChild(btn);
   }
   $('frameSlider').max=Math.max(0,faceSamples.length-1);
   $('frameSlider').value='0';$('frameSlider').disabled=!faceSamples.length;
   $('facialSummary').textContent='Mẫu mặt hợp lệ: '+timelineData.valid_frames+'/'+faceSamples.length+' · Số bước nhảy đột ngột (ngưỡng tham khảo 0.25): '+Object.values(timelineData.summary).reduce((n,v)=>n+v.jump_count,0);
   const report={schema_version:'1.3-browser-preview',source:sourceName,
     video:{duration:video.duration,width:video.videoWidth,height:video.videoHeight},
     sampling_target_fps:5,motion_quality:qualityData,facial_motion:timelineData,face_tracking:{detected_frames:faceDetected,total_frames:faceSamples.length,frames:faceSamples},hand_tracking:{detected_frames:handDetected,total_frames:handSamples.length,frames:handSamples},limb_tracking:limbStats,motion_summary:motionSummary,motion_timeseries:motionSeries,frames:samples,
     limitations:['Single-person pose only','Browser-based processing','No camera tracking','No AI generation']};
   window.motionReport=report;
   applyReport(report);
   saveReport(report).then(()=>{renderSessions();$('sessionStatus').textContent='Đã lưu video và kết quả phân tích trên thiết bị.'}).catch(e=>{$('sessionStatus').textContent='Không lưu được kết quả: '+e.message});
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

function renderTimeline(data){
 const c=$('timeline'),g=c.getContext('2d'),w=c.width,h=c.height;
 g.clearRect(0,0,w,h);g.fillStyle='#101b17';g.fillRect(0,0,w,h);
 const active=$('smooth').checked&&qualityData?qualityData.preview_smoothed:data.metrics;
 const series=[['mouth_open','#e7c78d'],['left_eye_open','#78d6fa'],['right_eye_open','#e98db5'],['yaw_proxy','#94db9c']];
 for(const [key,color] of series){
   const pts=active.map((m,i)=>m&&Number.isFinite(Number(m[key]))?{x:i/Math.max(1,active.length-1)*w,y:Number(m[key]),index:i}:null);
   const values=pts.filter(Boolean).map(p=>p.y);if(values.length<2)continue;
   const lo=Math.min(...values),hi=Math.max(...values);
   g.strokeStyle=color;g.lineWidth=2;g.beginPath();
   let connected=false;pts.forEach(p=>{if(!p){connected=false;return}const y=h-15-(p.y-lo)/Math.max(.0001,hi-lo)*(h-30);connected?g.lineTo(p.x,y):g.moveTo(p.x,y);connected=true});
   g.stroke();
 }
 g.fillStyle='#e9eee9';g.font='13px system-ui';g.fillText('Vàng: miệng · Xanh: mắt trái · Hồng: mắt phải · Lục: lệch đầu 2D',12,18);
 drawTimelineCursor();
}
$('frameSlider').addEventListener('input',async()=>{
 if(running||!faceSamples.length)return;
 const i=Number($('frameSlider').value),t=faceSamples[i]?.time;
 if(t===undefined)return;
 $('frameTime').textContent=t.toFixed(2)+'s';
 const seekVersion=++syncSeekVersion;
 video.pause();
 frameSeekQueue=frameSeekQueue.catch(()=>{}).then(async()=>{
  if(seekVersion!==syncSeekVersion)return;
  try{
   if(Math.abs(video.currentTime-t)>.025)await seekTo(t);
   if(seekVersion!==syncSeekVersion)return;
   latestFace=alignedSample(faceSamples,t)?.landmarks||[];
   latestHands=alignedSample(handSamples,t)?.hands||[];
   draw(alignedSample(samples,t)?.landmarks||[]);
   updateTimelineSync();
  }catch(e){if(seekVersion===syncSeekVersion)state('Không tua được: '+e.message)}
 });
});


let syncSeekVersion=0;
let frameSeekQueue=Promise.resolve();
function nearestFrameIndex(time){
 if(!faceSamples.length)return -1;
 let lo=0,hi=faceSamples.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(Number(faceSamples[mid].time)<time)lo=mid+1;else hi=mid}
 if(lo>0&&Math.abs(Number(faceSamples[lo-1].time)-time)<=Math.abs(Number(faceSamples[lo].time)-time))return lo-1;
 return lo;
}
function drawTimelineCursor(){
 if(!timelineData||!faceSamples.length)return;
 const c=$('timeline'),g=c.getContext('2d');
 const last=Number(faceSamples.at(-1)?.time)||0;
 const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:Math.max(.001,last);
 const current=Number.isFinite(video.currentTime)?video.currentTime:Number(faceSamples[Number($('frameSlider').value)]?.time)||0;
 const x=Math.max(0,Math.min(c.width,c.width*current/duration));
 g.save();g.strokeStyle='#f7f3df';g.lineWidth=1.5;g.setLineDash([5,4]);g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke();g.restore();
}

// Align independently sampled detectors by timestamp, not by array position.
function alignedSample(frames,time,tolerance=.12){
 if(!Array.isArray(frames)||!frames.length||!Number.isFinite(time))return null;
 let best=null,delta=Infinity;
 for(const frame of frames){const d=Math.abs(Number(frame?.time)-time);if(Number.isFinite(d)&&d<delta){best=frame;delta=d}}
 return delta<=tolerance?best:null;
}
function updateReconstruction(time){
 const matched=selectSample(samples,time,.12);
 const frame=matched?($('skeletonSmooth').checked?smoothPose(samples,matched.index):matched.frame):null;
 const result=renderSkeleton($('skeleton3d'),frame,Number($('orbitAngle').value));
 $('reconstructionStatus').textContent=matched?'Video '+time.toFixed(2)+'s · Mẫu Pose '+matched.frame.time.toFixed(2)+'s · Δ '+matched.delta.toFixed(3)+'s · Độ phủ: '+Math.round(result.coverage*100)+'% · '+(result.status==='experimental'?'2.5D thử nghiệm':'Dữ liệu yếu')+($('skeletonSmooth').checked?' · Đang xem bản làm mượt':' · Dữ liệu thô'):'Không có mẫu Pose đồng bộ ±0,12s tại '+time.toFixed(2)+'s';
}
$('orbitAngle').addEventListener('input',()=>{$('orbitValue').textContent=$('orbitAngle').value+'°';updateReconstruction(Number(video.currentTime)||0)});
$('skeletonSmooth').addEventListener('change',()=>updateReconstruction(Number(video.currentTime)||0));
function inspectFrame(index){
 const count=Math.max(samples.length,faceSamples.length,handSamples.length);
 const pos=$('inspectPosition'),detail=$('inspectDetails');
 if(!count){pos.textContent='Chưa có mẫu';detail.textContent='Chưa có dữ liệu phân tích.';$('inspectPrev').disabled=true;$('inspectNext').disabled=true;return}
 const i=Math.max(0,Math.min(count-1,Math.trunc(Number(index)||0)));
 const anchor=faceSamples[i]||samples[i]||handSamples[i];
 const time=Number(anchor?.time??0);
 const poseFrame=alignedSample(samples,time),faceFrame=alignedSample(faceSamples,time),handFrame=alignedSample(handSamples,time);
 const landmarks=poseFrame?.landmarks||[];
 updateReconstruction(time);
 if(!running){latestFace=faceFrame?.landmarks||[];latestHands=handFrame?.hands||[];draw(landmarks)}
 const ids={left_shoulder:11,right_shoulder:12,left_elbow:13,right_elbow:14,left_wrist:15,right_wrist:16,left_hip:23,right_hip:24,left_knee:25,right_knee:26,left_ankle:27,right_ankle:28};
 const joints=Object.entries(ids).map(([name,id])=>{
  const p=landmarks[id];return name+': '+(p?'visibility '+Number(p.visibility??0).toFixed(3)+(visible(p)?' · hợp lệ':' · thiếu/che khuất'):'không có dữ liệu');
 });
 const warnings=reviewItems(window.motionReport||{}).items.filter(item=>Number.isFinite(Number(item.time))&&Math.abs(Number(item.time)-time)<.11);
 pos.textContent='Mẫu '+(i+1)+'/'+count+' · '+time.toFixed(2)+'s';
 $('inspectPrev').disabled=i===0;$('inspectNext').disabled=i===count-1;
 detail.textContent='Pose: '+(poseFrame?.pose_detected?'đã phát hiện':'không phát hiện')+
  '\\nKhuôn mặt: '+(faceFrame?.detected?'đã phát hiện':'không phát hiện')+
  '\\nBàn tay: '+(handFrame?.hands?.length??0)+' phát hiện'+
  '\\nCảnh báo gần mẫu: '+(warnings.length?warnings.map(w=>w.label+' ['+(reviewDecisions[w.id]||'chưa đánh giá')+']').join('; '):'không có')+
  '\\n\\nĐiểm khớp (tọa độ 2D tương đối):\\n'+joints.join('\\n');
}
function stepInspectedFrame(delta){
 if(!faceSamples.length||running)return;
 const slider=$('frameSlider'),next=Math.max(0,Math.min(faceSamples.length-1,Number(slider.value)+delta));
 slider.value=String(next);slider.dispatchEvent(new Event('input'));
}
$('inspectPrev').addEventListener('click',()=>stepInspectedFrame(-1));
$('inspectNext').addEventListener('click',()=>stepInspectedFrame(1));

function updateTimelineSync(){
 if(!faceSamples.length||running)return;
 const index=nearestFrameIndex(Number(video.currentTime)||0);
 if(index<0)return;
 $('frameSlider').value=String(index);
 $('frameTime').textContent=(Number(video.currentTime)||0).toFixed(2)+'s';
 $('syncStatus').textContent='Đang xem '+(Number(video.currentTime)||0).toFixed(2)+'s · Mẫu '+(index+1)+'/'+faceSamples.length;
 if(timelineData)renderTimeline(timelineData);
 inspectFrame(index);
}
video.addEventListener('timeupdate',updateTimelineSync);
video.addEventListener('seeked',updateTimelineSync);
$('timeline').addEventListener('click',event=>{
 if(running||!faceSamples.length||!Number.isFinite(video.duration))return;
 const rect=$('timeline').getBoundingClientRect();
 const fraction=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));
 const target=Math.min(Math.max(0,video.duration-.02),fraction*video.duration);
 const index=nearestFrameIndex(target);
 if(index<0)return;
 $('frameSlider').value=String(index);
 $('frameSlider').dispatchEvent(new Event('input'));
});

$('smooth').addEventListener('change',()=>{if(timelineData)renderTimeline(timelineData)});

$('transfer').addEventListener('click',()=>{
 if(!window.motionReport)return;
 try{
 const pkg=transferPackage(window.motionReport);
 const blob=new Blob([JSON.stringify(pkg)],{type:'application/json'}),link=document.createElement('a');
 link.href=URL.createObjectURL(blob);link.download='HOANGGIA-motion-transfer-v1.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(link.href),3000);
 }catch(e){state('Không xuất được gói chuyển động: '+e.message)}
});


function applyReport(report){
 window.motionReport=report;
 samples=report.frames||[];
 faceSamples=report.face_tracking?.frames||[];
 handSamples=report.hand_tracking?.frames||[];
 timelineData=report.facial_motion||buildTimeline(faceSamples);
 qualityData=report.motion_quality||qualityAnalysis(timelineData.metrics);
 reviewDecisions=restoreReview(localStorage,report,reviewItems(report).items);
 renderTimeline(timelineData);
 $('syncStatus').textContent='Đã nạp dữ liệu · Bấm biểu đồ hoặc kéo thanh tua để xem khung hình.';
 $('frameSlider').max=Math.max(0,faceSamples.length-1);
 $('frameSlider').value='0';$('frameSlider').disabled=!faceSamples.length;
 const flags=qualityData.flags||[];
 $('qualityFlags').textContent='Cảnh báo biến thiên đột ngột: '+flags.length+' · Khoảng thiếu dữ liệu: '+(qualityData.missing_ranges||[]).length+'\n'+flags.slice(0,24).map(f=>Number(f.time).toFixed(2)+'s · '+f.metric+' · Δ='+f.delta).join('\n');
 const reviewBox=$('reviewButtons');reviewBox.replaceChildren();
 for(const flag of classifyChanges(timelineData.metrics,flags).slice(0,30)){
  const btn=document.createElement('button');btn.type='button';btn.textContent=Number(flag.time).toFixed(2)+'s · '+flag.metric;
  btn.onclick=()=>{const slider=$('frameSlider');slider.value=String(flag.index);slider.dispatchEvent(new Event('input'))};reviewBox.appendChild(btn);
 }
 $('facialSummary').textContent='Mẫu mặt hợp lệ: '+timelineData.valid_frames+'/'+faceSamples.length+' · Số cảnh báo: '+flags.length;
 const faceDetected=report.face_tracking?.detected_frames??faceSamples.filter(f=>f.detected).length;
 const handDetected=report.hand_tracking?.detected_frames??handSamples.filter(f=>(f.hands||[]).length).length;
 $('faceHandMetrics').textContent='Khuôn mặt: '+faceDetected+'/'+faceSamples.length+' mẫu · Bàn tay: '+handDetected+'/'+handSamples.length+' mẫu.';
 const names={left_arm:'Tay trái',right_arm:'Tay phải',left_leg:'Chân trái',right_leg:'Chân phải'};
 $('limbMetrics').textContent=Object.entries(report.limb_tracking||{}).map(([key,v])=>names[key]+': '+(v.tracking_rate<.05?'Không đủ dữ liệu':Math.round(v.tracking_rate*100)+'% khung hình · tin cậy '+v.mean_visibility)).join('\\n');
 const detected=samples.filter(x=>x.pose_detected).length;
 $('stats').textContent=JSON.stringify({duration_seconds:+Number(report.video.duration).toFixed(2),samples:samples.length,pose_detected:detected,detection_rate:samples.length?+(detected/samples.length).toFixed(3):0,dimensions:report.video.width+'×'+report.video.height},null,2);
 $('json').disabled=!samples.length;$('transfer').disabled=!samples.length;
 renderQualityReview();
 inspectFrame(0);
}
async function recoverSession(){
 try{
  const saved=await loadSession();if(!saved?.file)return;
  activeFile=new File([saved.file],saved.filename,{type:saved.type});sourceName=saved.filename;
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(activeFile);video.src=url;
  $('analyze').disabled=false;
  video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(saved.position||0,Math.max(0,(video.duration||0)-.05))},{once:true});
  if(saved.report){applyReport(saved.report);state('Đã khôi phục video và kết quả phân tích từ phiên trước.');}
  else state('Đã khôi phục video nguồn. Có thể phân tích lại.');
  $('sessionStatus').textContent='Phiên được lưu trên thiết bị · '+(saved.size/1048576).toFixed(1)+' MB · '+saved.updated_at;
  await renderSessions();
 }catch(e){$('sessionStatus').textContent='Không khôi phục được phiên: '+e.message}
}
$('clearSession').onclick=async()=>{
 if(!confirm('Xóa video và kết quả phân tích đã lưu trên thiết bị này?'))return;
 try{const saved=await loadSession();if(saved?.id)await deleteSession(saved.id);else await clearSession();await renderSessions();$('sessionStatus').textContent='Đã xóa phiên đang mở. Tải lại trang hoặc chọn phiên khác.'}
 catch(e){$('sessionStatus').textContent='Không xóa được phiên: '+e.message}
};
async function renderSessions(){
 const list=$('sessionList');list.replaceChildren();
 try{
  const sessions=await listSessions();
  const active=await loadSession();
  for(const entry of sessions){
   const row=document.createElement('div');row.className='session-row';
   const label=document.createElement('span');label.textContent=entry.filename+' · '+(entry.size/1048576).toFixed(1)+' MB · '+(entry.analyzed?'Đã phân tích':'Chưa phân tích')+(entry.id===active?.id?' · Đang mở':'');row.appendChild(label);
   const open=document.createElement('button');open.type='button';open.textContent='Mở phiên';open.onclick=async()=>{if(running)return;try{await selectSession(entry.id);location.reload()}catch(e){state(e.message)}};row.appendChild(open);
   const del=document.createElement('button');del.type='button';del.textContent='Xóa';del.onclick=async()=>{if(!confirm('Xóa phiên '+entry.filename+'?'))return;try{await deleteSession(entry.id);await renderSessions()}catch(e){state(e.message)}};row.appendChild(del);
   list.appendChild(row);
  }
  if(!sessions.length)list.textContent='Chưa có phiên đã lưu.';
 }catch(e){list.textContent='Không đọc được thư viện phiên: '+e.message}
}
let lastSavedPosition=0;
video.addEventListener('timeupdate',()=>{if(!activeFile||running)return;const now=Date.now();if(now-lastSavedPosition<3000)return;lastSavedPosition=now;savePosition(video.currentTime).catch(()=>{})});
recoverSession().then(renderSessions);

function renderQualityReview(){
 const report=window.motionReport;if(!report)return;
 const {readiness,items}=reviewItems(report),list=$('reviewList');
 const decided=items.filter(i=>['accepted','rejected'].includes(reviewDecisions[i.id])).length;
 $('reviewStatus').textContent='Đã đánh giá '+decided+'/'+items.length+' cảnh báo · '+(readiness.status==='facial_2d_ready'?'Đủ độ phủ mặt 2D':'Cần kiểm tra chất lượng');
 $('reviewReadiness').textContent='Khuôn mặt: '+readiness.face_valid+'/'+readiness.face_total+' ('+Math.round(readiness.face_coverage*100)+'%) · Bàn tay bất thường: '+readiness.duplicate_hand_frames.length+' khung · Chuyển động bất thường: '+readiness.abrupt_change_count+' · Cơ thể: chưa đạt điều kiện chuyển toàn thân'+(readiness.blockers.length?'\nCảnh báo chặn: '+readiness.blockers.join(', '):'');
 list.replaceChildren();
 for(const item of items){
  const row=document.createElement('div');row.className='review-item';
  const label=document.createElement('div');label.textContent=(item.kind==='hands'?'Bàn tay · ':'Chuyển động · ')+item.label;row.appendChild(label);
  const seek=document.createElement('button');seek.type='button';seek.textContent='Xem khung hình';seek.onclick=()=>{const slider=$('frameSlider');slider.value=String(item.index);slider.dispatchEvent(new Event('input'));document.getElementById('viewer').scrollIntoView({behavior:'smooth',block:'center'})};row.appendChild(seek);
  for(const [value,caption] of [['accepted','Chấp nhận'],['rejected','Đánh dấu lỗi']]){
   const btn=document.createElement('button');btn.type='button';btn.textContent=(reviewDecisions[item.id]===value?'✓ ':'')+caption;
   btn.setAttribute('aria-pressed',String(reviewDecisions[item.id]===value));
   btn.onclick=()=>{reviewDecisions[item.id]=value;saveReview(localStorage,report,reviewDecisions);renderQualityReview()};row.appendChild(btn);
  }
  list.appendChild(row);
 }
 if(!items.length){const note=document.createElement('p');note.textContent='Không có cảnh báo theo ngưỡng hiện tại.';list.appendChild(note)}
 $('reviewExport').disabled=decided!==items.length;
 const anomalies=handAnomalies(report);
 const suspected=anomalies.filter(a=>a.classification==='possible_duplicate').length;
 $('handClassification').textContent='Kiểm tra bàn tay: '+suspected+' khung nghi nhận diện trùng cổ tay · '+(anomalies.length-suspected)+' khung chưa xác định nguyên nhân. Dữ liệu gốc được giữ nguyên.';
 $('reviewSaved').textContent='Đánh giá được lưu trên trình duyệt hiện tại (không đồng bộ máy khác).';
}
$('reviewExport').addEventListener('click',()=>{
 if(!window.motionReport)return;
 try{
  const pkg=reviewedPackage(window.motionReport,reviewDecisions);
  const blob=new Blob([JSON.stringify(pkg,null,2)],{type:'application/json'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='HOANGGIA-motion-reviewed-v1.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),3000);
 }catch(e){state('Không xuất được gói đánh giá: '+e.message)}
});

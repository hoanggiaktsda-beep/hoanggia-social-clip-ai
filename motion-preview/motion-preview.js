import {buildTimeline} from './facial-metrics.js';
import {qualityAnalysis} from './motion-quality.js';
import {transferPackage,classifyChanges} from './transfer-package.js';
import {reviewItems,reviewedPackage} from './quality-review.js';
import {restoreReview,saveReview,handAnomalies} from './hand-quality.js';
import {saveSession,loadSession,clearSession,saveReport} from './session-store.js';
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
$('file').onchange=async()=>{
 running=false;if(url)URL.revokeObjectURL(url);
 const file=$('file').files?.[0];if(!file)return;
 sourceName=file.name;activeFile=file;url=URL.createObjectURL(file);video.src=url;
 try{await saveSession(file);$('sessionStatus').textContent='Đã lưu video trên thiết bị; có thể tải lại trang.'}catch(e){$('sessionStatus').textContent='Không lưu được video: '+e.message+' — hãy giữ bản gốc.'}
 samples=[];faceSamples=[];handSamples=[];latestFace=[];latestHands=[];timelineData=null;qualityData=null;reviewDecisions={};$('reviewList').replaceChildren();$('reviewExport').disabled=true;$('reviewStatus').textContent='Chưa có dữ liệu phân tích.';$('reviewReadiness').textContent='';$('transfer').disabled=true;$('reviewButtons').replaceChildren();$('qualityFlags').textContent='Chưa đánh giá chất lượng.';$('smooth').checked=false;$('frameSlider').disabled=true;$('facialSummary').textContent='Chưa có dữ liệu khuôn mặt.';$('json').disabled=true;$('analyze').disabled=false;
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
   saveReport(report).then(()=>{$('sessionStatus').textContent='Đã lưu video và kết quả phân tích trên thiết bị.'}).catch(e=>{$('sessionStatus').textContent='Không lưu được kết quả: '+e.message});
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
   const pts=active.map((m,i)=>m?{x:i/Math.max(1,active.length-1)*w,y:m[key]}:null).filter(Boolean);
   if(pts.length<2)continue;
   const values=pts.map(p=>p.y),lo=Math.min(...values),hi=Math.max(...values);
   g.strokeStyle=color;g.lineWidth=2;g.beginPath();
   pts.forEach((p,i)=>{const y=h-15-(p.y-lo)/Math.max(.0001,hi-lo)*(h-30);i?g.lineTo(p.x,y):g.moveTo(p.x,y)});
   g.stroke();
 }
 g.fillStyle='#e9eee9';g.font='13px system-ui';g.fillText('Vàng: miệng · Xanh: mắt trái · Hồng: mắt phải · Lục: lệch đầu 2D',12,18);
}
$('frameSlider').addEventListener('input',async()=>{
 if(running||!faceSamples.length)return;
 const i=Number($('frameSlider').value),t=faceSamples[i]?.time;
 if(t===undefined)return;
 $('frameTime').textContent=t.toFixed(2)+'s';
 try{video.pause();if(Math.abs(video.currentTime-t)>.025)await seekTo(t);
   latestFace=faceSamples[i]?.landmarks||[];latestHands=handSamples[i]?.hands||[];
   draw(samples[i]?.landmarks||[]);
 }catch(e){state('Không tua được: '+e.message)}
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
 $('frameSlider').max=Math.max(0,faceSamples.length-1);
 $('frameSlider').value='0';$('frameSlider').disabled=!faceSamples.length;
 const flags=qualityData.flags||[];
 $('qualityFlags').textContent='Cảnh báo biến thiên đột ngột: '+flags.length+' · Khoảng thiếu dữ liệu: '+(qualityData.missing_ranges||[]).length+'\\n'+flags.slice(0,24).map(f=>Number(f.time).toFixed(2)+'s · '+f.metric+' · Δ='+f.delta).join('\\n');
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
}
async function recoverSession(){
 try{
  const saved=await loadSession();if(!saved?.file)return;
  activeFile=new File([saved.file],saved.filename,{type:saved.type});sourceName=saved.filename;
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(activeFile);video.src=url;
  $('analyze').disabled=false;
  if(saved.report){applyReport(saved.report);state('Đã khôi phục video và kết quả phân tích từ phiên trước.');}
  else state('Đã khôi phục video nguồn. Có thể phân tích lại.');
  $('sessionStatus').textContent='Phiên được lưu trên thiết bị · '+(saved.size/1048576).toFixed(1)+' MB · '+saved.updated_at;
 }catch(e){$('sessionStatus').textContent='Không khôi phục được phiên: '+e.message}
}
$('clearSession').onclick=async()=>{
 if(!confirm('Xóa video và kết quả phân tích đã lưu trên thiết bị này?'))return;
 try{await clearSession();$('sessionStatus').textContent='Đã xóa phiên đã lưu. Tải lại trang để bắt đầu mới.'}
 catch(e){$('sessionStatus').textContent='Không xóa được phiên: '+e.message}
};
recoverSession();

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

const $=id=>document.getElementById(id);
const video=$('video'),canvas=$('overlay'),ctx=canvas.getContext('2d');
const state=msg=>{$('state').textContent=msg};
let url=null,running=false,samples=[],pose=null,sourceName='';
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
function draw(landmarks){
 const w=canvas.width=video.videoWidth||640,h=canvas.height=video.videoHeight||360;
 ctx.clearRect(0,0,w,h);
 if(!$('show').checked||!landmarks)return;
 ctx.lineWidth=Math.max(2,w/320);ctx.strokeStyle='#e9bb68';ctx.fillStyle='#66edbc';
 for(const [a,b] of EDGES){const p=landmarks[a],q=landmarks[b];if(p?.visibility>.4&&q?.visibility>.4){ctx.beginPath();ctx.moveTo(p.x*w,p.y*h);ctx.lineTo(q.x*w,q.y*h);ctx.stroke()}}
 for(const p of landmarks){if(p.visibility<.4)continue;ctx.beginPath();ctx.arc(p.x*w,p.y*h,Math.max(2,w/320),0,Math.PI*2);ctx.fill()}
}
$('file').onchange=()=>{
 running=false;if(url)URL.revokeObjectURL(url);
 const file=$('file').files?.[0];if(!file)return;
 sourceName=file.name;url=URL.createObjectURL(file);video.src=url;
 samples=[];$('json').disabled=true;$('analyze').disabled=false;
 state('Video đã chọn. Nhấn Phân tích video.');$('stats').textContent='Chưa phân tích.';
};
$('stop').onclick=()=>{running=false;video.pause();state('Đã dừng phân tích.')};
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
   await ensurePose();video.pause();
   const count=Math.min(600,Math.ceil(video.duration*5));
   for(let i=0;i<count&&running;i++){
     const t=Math.min(video.duration-.02,i/5);
     if(t<0)break;
     if(Math.abs(video.currentTime-t)>.025)await seekTo(t);
     if(!running)break;
     await pose.send({image:video});
     if(i%5===0)state('Đang phân tích '+Math.round(100*(i+1)/count)+'% · '+samples.length+' mẫu');
   }
   const detected=samples.filter(x=>x.pose_detected).length;
   const report={schema_version:'1.1-browser-preview',source:sourceName,
     video:{duration:video.duration,width:video.videoWidth,height:video.videoHeight},
     sampling_target_fps:5,frames:samples,
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
window.addEventListener('pagehide',()=>{running=false;if(url)URL.revokeObjectURL(url);pose?.close()});

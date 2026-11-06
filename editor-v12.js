'use strict';
const $=id=>document.getElementById(id);
const file=$('file'),video=$('video'),info=$('info'),start=$('start'),end=$('end'),play=$('play'),bar=$('bar'),msg=$('message'),inSlider=$('hg-in'),outSlider=$('hg-out'),exportBtn=$('hg-export'),exportStatus=$('hg-export-status'),download=$('hg-download');
let url=null,duration=0,clipMode=false,recording=false,recordStop=null,downloadUrl=null,thumbToken=0;
function valid(){const a=Number(start.value),b=Number(end.value);return Number.isFinite(duration)&&duration>0&&Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>a&&b<=duration+.02}
function sync(source='number'){
 if(source==='in')start.value=(Number(inSlider.value)/1000*duration).toFixed(2);
 if(source==='out')end.value=(Number(outSlider.value)/1000*duration).toFixed(2);
 if(source==='number'&&duration){inSlider.value=String(Math.max(0,Math.min(1000,Math.round(Number(start.value)/duration*1000))));outSlider.value=String(Math.max(0,Math.min(1000,Math.round(Number(end.value)/duration*1000))))}
 const ok=valid();play.disabled=!ok||recording;exportBtn.disabled=!ok||recording||!canExport();
 const left=duration?Number(start.value)/duration*100:0,right=duration?Number(end.value)/duration*100:0;
 $('hg-selection').style.left=left+'%';$('hg-selection').style.right=(100-right)+'%';
 bar.style.width=Math.max(0,right-left)+'%';
 if(!ok&&duration)msg.textContent='Khoảng cắt không hợp lệ.';
 return ok;
}
function canExport(){return typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement!=='undefined'&&!!HTMLCanvasElement.prototype.captureStream}
function revokeDownload(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;download.hidden=true;download.removeAttribute('href')}
file.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;thumbToken++;clipMode=false;video.pause();if(url)URL.revokeObjectURL(url);revokeDownload();url=URL.createObjectURL(f);duration=0;video.src=url;video.style.display='block';$('empty').style.display='none';info.textContent=f.name+' · '+(f.size/1048576).toFixed(1)+' MB';video.load();msg.textContent='Đang đọc thông tin video…';$('hg-thumbs').replaceChildren();sync()});
video.addEventListener('loadedmetadata',()=>{duration=Number.isFinite(video.duration)?video.duration:0;start.value='0';end.value=String(Math.min(30,duration));info.textContent=file.files[0].name+' · '+(file.files[0].size/1048576).toFixed(1)+' MB · '+duration.toFixed(2)+' giây';msg.textContent=duration?'Sẵn sàng biên tập.':'Không xác định được thời lượng.';sync();generateThumbs(url,++thumbToken)});
video.addEventListener('error',()=>{msg.textContent='Trình duyệt không phát được codec của video này.'});
[start,end].forEach(el=>el.addEventListener('input',()=>sync()));
inSlider.addEventListener('input',()=>sync('in'));outSlider.addEventListener('input',()=>sync('out'));
$('hg-timeline').addEventListener('click',e=>{if(!duration||recording)return;const rect=e.currentTarget.getBoundingClientRect();const p=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));video.currentTime=p*duration});
video.addEventListener('timeupdate',()=>{if(duration)$('hg-playhead').style.left=(video.currentTime/duration*100)+'%';if(clipMode&&video.currentTime>=Number(end.value)){video.pause();clipMode=false;msg.textContent='Đã phát hết đoạn chọn.'}});
play.addEventListener('click',async()=>{if(!sync())return;clipMode=true;video.currentTime=Number(start.value);try{await video.play();msg.textContent='Đang xem đoạn đã chọn.'}catch(e){msg.textContent='Không thể phát: '+e.message}});
function updateFit(){const [w,h]=$('aspect').value.split(':').map(Number);const frame=document.querySelector('.preview');frame.style.aspectRatio=w+'/'+h;frame.style.maxHeight='560px';video.style.width='100%';video.style.height='100%';video.style.objectFit=$('fit').value}
$('aspect').addEventListener('change',updateFit);$('fit').addEventListener('change',updateFit);
async function generateThumbs(src,token){const el=$('hg-thumbs');const probe=document.createElement('video');probe.muted=true;probe.preload='auto';probe.playsInline=true;probe.src=src;const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');if(!ctx)return;
 for(let i=0;i<10;i++){if(token!==thumbToken)return;const time=Math.min(Math.max(0,duration-.05),(i+.5)*duration/10);try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('seek timeout'))},1800);function cleanup(){clearTimeout(timer);probe.removeEventListener('seeked',done);probe.removeEventListener('error',fail)}function done(){cleanup();resolve()}function fail(){cleanup();reject(Error('decode'))}probe.addEventListener('seeked',done,{once:true});probe.addEventListener('error',fail,{once:true});probe.currentTime=time});ctx.drawImage(probe,0,0,160,90);const img=document.createElement('img');img.alt='Khung '+(i+1);img.src=canvas.toDataURL('image/jpeg',.55);el.append(img)}catch(e){break}}
 probe.removeAttribute('src');probe.load();
}
function mime(){const candidates=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];return candidates.find(x=>MediaRecorder.isTypeSupported(x))||null}
async function seek(t){if(Math.abs(video.currentTime-t)<.05)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Seek timeout'))},5000);function cleanup(){clearTimeout(timer);video.removeEventListener('seeked',done)}function done(){cleanup();resolve()}video.addEventListener('seeked',done,{once:true});video.currentTime=t})}
exportBtn.addEventListener('click',async()=>{
 if(!sync()||recording)return;const type=mime();if(!type){exportStatus.textContent='Trình duyệt không hỗ trợ định dạng ghi video.';return}
 recording=true;clipMode=false;sync();revokeDownload();let raf=0,recorder=null,audioCtx=null,source=null,stream=null;
 try{
  video.pause();await seek(Number(start.value));
  const [rw,rh]=$('aspect').value.split(':').map(Number);const scale=rw/rh;const width=scale<1?540:Math.round(540*scale);const height=Math.round(width/scale);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Không tạo được canvas');
  stream=canvas.captureStream(30);
  // Audio is attached only when browser permits MediaElementAudioSource.
  try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){audioCtx=new AC();source=audioCtx.createMediaElementSource(video);const dest=audioCtx.createMediaStreamDestination();source.connect(dest);source.connect(audioCtx.destination);dest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));await audioCtx.resume()}}catch(e){exportStatus.textContent='Không thể thu âm thanh trên trình duyệt này; đang thử xuất hình ảnh.'}
  const chunks=[];recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:2500000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  const completed=new Promise((resolve,reject)=>{recorder.onerror=()=>reject(Error('Lỗi ghi video'));recorder.onstop=()=>resolve()});
  const a=Number(start.value),b=Number(end.value);
  function draw(){if(!recording)return;const sw=video.videoWidth,sh=video.videoHeight;if(sw&&sh){ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);const fit=$('fit').value;const factor=fit==='cover'?Math.max(width/sw,height/sh):Math.min(width/sw,height/sh);const dw=sw*factor,dh=sh*factor;ctx.drawImage(video,(width-dw)/2,(height-dh)/2,dw,dh)}raf=requestAnimationFrame(draw)}
  draw();recorder.start(250);await video.play();exportStatus.textContent='Đang xuất theo thời gian thực… 0%';
  await new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(!recording){clearInterval(timer);reject(Error('Đã dừng xuất'))}const pct=Math.max(0,Math.min(100,Math.round((video.currentTime-a)/(b-a)*100)));exportStatus.textContent='Đang xuất theo thời gian thực… '+pct+'%';if(video.currentTime>=b-.035||video.ended){clearInterval(timer);resolve()}},40);video.addEventListener('error',()=>{clearInterval(timer);reject(Error('Video không thể phát'))},{once:true})});
  video.pause();recorder.stop();await completed;
  const ext=type.includes('mp4')?'mp4':'webm';downloadUrl=URL.createObjectURL(new Blob(chunks,{type:type.split(';')[0]}));download.href=downloadUrl;download.download='HOANGGIA-SOCIAL-CLIP.'+ext;download.textContent='↓ Tải clip '+ext.toUpperCase();download.hidden=false;exportStatus.textContent='Đã xuất '+ext.toUpperCase()+'. Hãy kiểm tra âm thanh và thời lượng clip sau khi tải.';
 }catch(e){exportStatus.textContent='Không thể xuất: '+e.message;if(recorder&&recorder.state!=='inactive')recorder.stop()}
 finally{recording=false;cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());if(source){try{source.disconnect()}catch(e){}}if(audioCtx)audioCtx.close().catch(()=>{});sync()}
});
window.addEventListener('pagehide',()=>{thumbToken++;if(url)URL.revokeObjectURL(url);revokeDownload()});
updateFit();sync();
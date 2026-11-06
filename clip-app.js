'use strict';
const $=id=>document.getElementById(id);
const P={tiktok:['TikTok','9:16',60],reels:['Instagram Reels','9:16',60],shorts:['YouTube Shorts','9:16',60],twitter:['X / Twitter','16:9',140],linkedin:['LinkedIn','16:9',600]};
let platform='tiktok',url=null,srcFile=null,duration=0,preview=false,thumbUrl=null;
const video=$('video'),start=$('start'),end=$('end'),ins=$('inSlider'),outs=$('outSlider');
const status=t=>$('status').textContent=t;
const bounds=()=>[Number(start.value),Number(end.value)];
function valid(){const [a,b]=bounds();return !!srcFile&&duration>0&&a>=0&&b>a+.04&&b<=duration+.02&&b-a<=P[platform][2]+.02}
function report(){
 const [a,b]=bounds();return {clip_id:null,platform,source_filename:srcFile?.name||null,source_duration_seconds:duration||null,range:{start:a,end:b,duration:Math.max(0,b-a)},output:{aspect_ratio:$('aspect').value,fit:$('fit').value,video_codec:'H.264',audio_codec:'AAC',crf:23,audio_bitrate:'128k'},caption_status:$('subtitles').value.trim()?'user_supplied_srt':'not_generated',thumbnail_filename:srcFile?'thumbnail.jpg':null,ai_highlight_status:'not_implemented',notes:['Platform limits are reference presets; verify before publishing','MP4 export requires a configured FFmpeg server']}}
function refresh(source){
 if(duration){
  if(source==='in')start.value=(duration*Number(ins.value)/1000).toFixed(2);
  if(source==='out')end.value=(duration*Number(outs.value)/1000).toFixed(2);
  if(source!=='in'&&source!=='out'){ins.value=Math.round(Math.max(0,Math.min(1,Number(start.value)/duration))*1000);outs.value=Math.round(Math.max(0,Math.min(1,Number(end.value)/duration))*1000)}
 }
 const [a,b]=bounds(),ok=valid();
 $('preview').disabled=!ok;$('thumb').disabled=!srcFile;$('render').disabled=!ok||!$('api').value.trim();
 const l=duration?Math.max(0,Math.min(100,a/duration*100)):0,r=duration?Math.max(0,Math.min(100,b/duration*100)):0;
 $('selection').style.left=l+'%';$('selection').style.right=(100-r)+'%';
 $('json').textContent=JSON.stringify(report(),null,2);
 const ratio=$('aspect').value,shape={'9:16':[1080,1920],'16:9':[1920,1080],'1:1':[1080,1080],'4:5':[1080,1350]}[ratio];
 const w=shape[0],h=shape[1],fit=$('fit').value;
 const filter=fit==='crop'?'scale='+w+':'+h+':force_original_aspect_ratio=increase,crop='+w+':'+h+',setsar=1':'scale='+w+':'+h+':force_original_aspect_ratio=decrease,pad='+w+':'+h+':(ow-iw)/2:(oh-ih)/2,setsar=1';
 $('command').textContent='ffmpeg -ss '+a.toFixed(2)+' -i "input.mp4" -t '+Math.max(0,b-a).toFixed(2)+' -vf "'+filter+'" -c:v libx264 -crf 23 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "output.mp4"';
 return ok;
}
function buttons(){
 $('platforms').replaceChildren();
 for(const [id,p] of Object.entries(P)){const button=document.createElement('button');button.className='platform'+(platform===id?' active':'');button.type='button';button.textContent=p[0];const small=document.createElement('small');small.textContent=p[1]+' · '+p[2]+'s';button.append(small);button.onclick=()=>{platform=id;$('aspect').value=p[1];buttons();if(duration&&Number(end.value)-Number(start.value)>p[2])end.value=String(Math.min(duration,Number(start.value)+p[2]));refresh()};$('platforms').append(button)}
}
function unlink(a){if(a.href&&a.href.startsWith('blob:'))URL.revokeObjectURL(a.href);a.hidden=true;a.removeAttribute('href')}
$('file').onchange=()=>{
 const f=$('file').files?.[0];if(!f)return;preview=false;video.pause();if(url)URL.revokeObjectURL(url);if(thumbUrl)URL.revokeObjectURL(thumbUrl);
 ['download','thumbnailDownload','reportDownload'].forEach(id=>unlink($(id)));
 srcFile=f;url=URL.createObjectURL(f);duration=0;video.hidden=false;$('placeholder').hidden=true;video.src=url;video.load();
 $('meta').textContent=f.name+' · '+(f.size/1048576).toFixed(1)+' MB';status('Đang đọc metadata video…');$('thumbs').replaceChildren();refresh();
};
video.onloadedmetadata=()=>{duration=Number.isFinite(video.duration)?video.duration:0;start.value=0;end.value=Math.min(duration,P[platform][2]).toFixed(2);refresh();status(duration?'Sẵn sàng xem trước.':'Không đọc được thời lượng.');makeThumbs()};
video.onerror=()=>status('Không thể phát video với codec này.');
[start,end].forEach(n=>n.oninput=()=>refresh());ins.oninput=()=>refresh('in');outs.oninput=()=>refresh('out');
['aspect','fit','api','subtitles'].forEach(id=>$(id).addEventListener('input',()=>refresh()));
$('timeline').onclick=e=>{if(!duration)return;const box=e.currentTarget.getBoundingClientRect();video.currentTime=Math.max(0,Math.min(duration,(e.clientX-box.left)/box.width*duration))};
video.ontimeupdate=()=>{if(duration)$('playhead').style.left=(video.currentTime/duration*100)+'%';if(preview&&video.currentTime>=Number(end.value)){preview=false;video.pause();status('Đã xem hết đoạn cắt.')}};
$('preview').onclick=async()=>{if(!valid())return;preview=true;video.currentTime=Number(start.value);try{await video.play();status('Đang phát đoạn cắt.')}catch(e){status('Không thể phát: '+e.message)}};
let thumbSeq=0;
async function makeThumbs(){
 const seq=++thumbSeq;if(!duration)return;const v=document.createElement('video');v.src=url;v.preload='auto';v.muted=true;v.playsInline=true;const c=document.createElement('canvas');c.width=160;c.height=90;const ctx=c.getContext('2d');if(!ctx)return;
 for(let i=0;i<8;i++){if(seq!==thumbSeq)break;try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('timeout'))},2500);function cleanup(){clearTimeout(timer);v.removeEventListener('seeked',done);v.removeEventListener('error',bad)}function done(){cleanup();resolve()}function bad(){cleanup();reject(Error('decode'))}v.addEventListener('seeked',done,{once:true});v.addEventListener('error',bad,{once:true});v.currentTime=Math.min(Math.max(0,duration-.05),(i+.5)*duration/8)});ctx.drawImage(v,0,0,160,90);const img=new Image();img.src=c.toDataURL('image/jpeg',.5);img.alt='Khung '+(i+1);$('thumbs').append(img)}catch(e){break}}
 v.removeAttribute('src');v.load();
}
$('thumb').onclick=()=>{if(!video.videoWidth)return;const canvas=document.createElement('canvas');canvas.width=Math.min(1280,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(!blob)return;const a=$('thumbnailDownload');unlink(a);a.href=URL.createObjectURL(blob);a.download='HOANGGIA-thumbnail.jpg';a.textContent='↓ Tải thumbnail JPG';a.hidden=false;status('Đã tạo thumbnail.')},'image/jpeg',.88)};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('command').textContent);status('Đã sao chép lệnh FFmpeg.')}catch(e){status('Không sao chép được, hãy sao chép từ bảng lệnh.')}};
$('jsonSave').onclick=()=>{const a=$('reportDownload');unlink(a);a.href=URL.createObjectURL(new Blob([$('json').textContent],{type:'application/json'}));a.download='HOANGGIA-clip-metadata.json';a.textContent='↓ Tải metadata JSON';a.hidden=false;a.click()};
$('render').onclick=async()=>{
 const base=$('api').value.trim().replace(/\/+$/,'');if(!valid()||!base)return;
 $('render').disabled=true;status('Đang kết nối API FFmpeg…');
 try{
  const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(8000)});if(!health.ok)throw Error('API không hoạt động');
  const token=$('token').value.trim();const auth=token?{'X-App-Token':token}:{};const fd=new FormData();fd.append('file',srcFile);const uploaded=await fetch(base+'/api/media',{method:'POST',headers:auth,body:fd});if(!uploaded.ok)throw Error('Upload bị từ chối');
  const media=await uploaded.json();status('Đang xuất MP4 qua FFmpeg…');
  const body={media_id:media.media_id,platform,start:Number(start.value),end:Number(end.value),aspect:$('aspect').value,fit:$('fit').value,subtitles:$('subtitles').value||null};
  const response=await fetch(base+'/api/clips',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify(body)});
  if(!response.ok)throw Error('Render lỗi: '+(await response.text()).slice(0,200));
  const result=await response.json();$('json').textContent=JSON.stringify(result,null,2);
  const prefix=base+'/api/clips/'+media.media_id+'/'+result.clip_id+'/';
  async function protectedAsset(kind,id,label,filename){
    const res=await fetch(prefix+kind,{headers:auth});
    if(!res.ok)throw Error('Không thể tải '+kind+' ('+res.status+')');
    const link=$(id);unlink(link);link.href=URL.createObjectURL(await res.blob());
    link.download=filename;link.textContent=label;link.hidden=false;
  }
  await protectedAsset('mp4','download','↓ Tải video MP4','HOANGGIA-clip.mp4');
  await protectedAsset('jpg','thumbnailDownload','↓ Tải thumbnail','HOANGGIA-thumbnail.jpg');
  status('FFmpeg đã render xong video và thumbnail.');
 }catch(e){status('Chưa xuất được: '+e.message+'. Web tĩnh không tự có máy chủ FFmpeg.')}
 finally{refresh()}
};
window.addEventListener('pagehide',()=>{thumbSeq++;if(url)URL.revokeObjectURL(url)});
buttons();refresh();
// Auto-connect only when UI and API share the same origin.
(async()=>{try{const r=await fetch('/api/health',{signal:AbortSignal.timeout(3000)});if(r.ok){const j=await r.json();if(j.status==='ok'){$('api').value=location.origin;refresh();$('engine-note').textContent='Đã phát hiện FFmpeg API cùng máy chủ. Nếu được yêu cầu, nhập khóa truy cập để xuất MP4.';}}}catch(e){/* Browser-only preview; no backend. */}})();

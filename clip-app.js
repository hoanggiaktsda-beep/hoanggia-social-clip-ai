'use strict';
const $=id=>document.getElementById(id);
const P={tiktok:['TikTok','9:16',60],reels:['Instagram Reels','9:16',60],shorts:['YouTube Shorts','9:16',60],twitter:['X / Twitter','16:9',140],linkedin:['LinkedIn','16:9',600]};
let platform='tiktok',url=null,srcFile=null,duration=0,preview=false,thumbUrl=null;
const video=$('video'),start=$('start'),end=$('end'),ins=$('inSlider'),outs=$('outSlider');
const status=t=>$('status').textContent=t;
const bounds=()=>[Number(start.value),Number(end.value)];
function valid(){const [a,b]=bounds();return !!srcFile&&duration>0&&a>=0&&b>a+.04&&b<=duration+.02&&b-a<=P[platform][2]+.02&&($("quality").value!=="hd"||b-a<=15.02)}
function report(){
 const [a,b]=bounds();return {clip_id:null,platform,source_filename:srcFile?.name||null,source_duration_seconds:duration||null,range:{start:a,end:b,duration:Math.max(0,b-a)},output:{aspect_ratio:$('aspect').value,fit:$('fit').value,video_codec:'H.264',audio_codec:'AAC',crf:24,audio_bitrate:'128k',quality:$('quality').value},caption_status:$('subtitles').value.trim()?'user_supplied_srt':'not_generated',thumbnail_filename:srcFile?'thumbnail.jpg':null,ai_highlight_status:'not_implemented',notes:['Platform limits are reference presets; verify before publishing','MP4 export requires a configured FFmpeg server']}}
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
 const ratio=$('aspect').value,hd=$('quality').value==='hd',shape=(hd?{'9:16':[720,1280],'16:9':[1280,720],'1:1':[720,720],'4:5':[720,900]}:{'9:16':[540,960],'16:9':[960,540],'1:1':[540,540],'4:5':[540,675]})[ratio];
 const w=shape[0],h=shape[1],fit=$('fit').value;
 const filter=fit==='crop'?'scale='+w+':'+h+':force_original_aspect_ratio=increase,crop='+w+':'+h+',setsar=1':'scale='+w+':'+h+':force_original_aspect_ratio=decrease,pad='+w+':'+h+':(ow-iw)/2:(oh-ih)/2,setsar=1';
 $('command').textContent='ffmpeg -ss '+a.toFixed(2)+' -i "input.mp4" -t '+Math.max(0,b-a).toFixed(2)+' -vf "'+filter+'" -c:v libx264 -crf 24 -preset ultrafast -threads 1 -filter_threads 1 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "output.mp4"';
 showSegments();return ok;
}
function buttons(){
 $('platforms').replaceChildren();
 for(const [id,p] of Object.entries(P)){const button=document.createElement('button');button.className='platform'+(platform===id?' active':'');button.type='button';button.textContent=p[0];const small=document.createElement('small');small.textContent=p[1]+' · '+p[2]+'s';button.append(small);button.onclick=()=>{platform=id;$('aspect').value=p[1];buttons();if(duration&&Number(end.value)-Number(start.value)>p[2])end.value=String(Math.min(duration,Number(start.value)+p[2]));refresh()};$('platforms').append(button)}
}
function unlink(a){if(a.href&&a.href.startsWith('blob:'))URL.revokeObjectURL(a.href);a.hidden=true;a.removeAttribute('href')}
$('file').onchange=()=>{
 const f=$('file').files?.[0];if(!f)return;preview=false;video.pause();if(url)URL.revokeObjectURL(url);if(thumbUrl)URL.revokeObjectURL(thumbUrl);
 ['download','thumbnailDownload','reportDownload'].forEach(id=>unlink($(id)));
 segments=[];showSegments();srcFile=f;url=URL.createObjectURL(f);duration=0;video.hidden=false;$('placeholder').hidden=true;video.src=url;video.load();
 $('meta').textContent=f.name+' · '+(f.size/1048576).toFixed(1)+' MB';status('Đang đọc metadata video…');$('thumbs').replaceChildren();refresh();
};
video.onloadedmetadata=()=>{duration=Number.isFinite(video.duration)?video.duration:0;start.value=0;end.value=Math.min(duration,P[platform][2]).toFixed(2);refresh();status(duration?'Sẵn sàng xem trước.':'Không đọc được thời lượng.');makeThumbs()};
video.onerror=()=>status('Không thể phát video với codec này.');
[start,end].forEach(n=>n.oninput=()=>refresh());ins.oninput=()=>refresh('in');outs.oninput=()=>refresh('out');
['aspect','fit','quality','api','subtitles'].forEach(id=>$(id).addEventListener('input',()=>refresh()));
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
 const base=$('api').value.trim().replace(/\/+$/,'');if(!valid()||!base){status('Khoảng cắt không hợp lệ. Chế độ HD 720p chỉ hỗ trợ tối đa 15 giây.');return;}
 $('render').disabled=true;status('Đang kết nối API FFmpeg…');
 try{
  const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(8000)});if(!health.ok)throw Error('API không hoạt động');
  const token=$('token').value.trim();if(!token)throw Error('Thiếu khóa truy cập. Mở Render Dashboard → Environment → APP_ACCESS_TOKEN, sao chép vào ô Khóa truy cập API.');const auth=token?{'X-App-Token':token}:{};const fd=new FormData();fd.append('file',srcFile);const uploaded=await fetch(base+'/api/media',{method:'POST',headers:auth,body:fd});if(uploaded.status===401)throw Error('Khóa truy cập API không đúng hoặc đã hết hiệu lực (401). Kiểm tra APP_ACCESS_TOKEN trong Render → Environment.');if(uploaded.status===413)throw Error('Video vượt giới hạn tải lên (413).');if(!uploaded.ok)throw Error('Upload thất bại (HTTP '+uploaded.status+').');
  const media=await uploaded.json();status('Đang xuất MP4 qua FFmpeg…');
  const body={media_id:media.media_id,platform,start:Number(start.value),end:Number(end.value),aspect:$('aspect').value,fit:$('fit').value,quality:$('quality').value,subtitles:$('subtitles').value||null};
  const response=await fetch(base+'/api/clips',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify(body)});
  if(response.status===401)throw Error('Khóa truy cập API không hợp lệ (401).');if(!response.ok)throw Error('Render lỗi HTTP '+response.status+': '+(await response.text()).slice(0,200));
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
 }catch(e){status('Chưa xuất được: '+e.message)}
 finally{refresh()}
};

let segments=[];
function showSegments(){
 const el=$('segmentList');el.replaceChildren();
 if(!segments.length)el.textContent='Chưa thêm đoạn nào.';
 segments.forEach((p,i)=>{
   const row=document.createElement('div');row.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #415448';
   const label=document.createElement('span');label.textContent=(i+1)+'. '+p.start.toFixed(2)+'s → '+p.end.toFixed(2)+'s';
   const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent='Xóa';
   remove.onclick=()=>{segments.splice(i,1);showSegments()};row.append(label,remove);el.append(row);
 });
 $('addSegment').disabled=!valid()||segments.length>=8;
 $('clearSegments').disabled=!segments.length;
 $('montage').disabled=segments.length<2||!$('api').value.trim();
}
$('addSegment').onclick=()=>{if(!valid()||segments.length>=8)return;const [a,b]=bounds();segments.push({start:a,end:b});showSegments();status('Đã thêm đoạn '+segments.length+'.')};
$('clearSegments').onclick=()=>{segments=[];showSegments();status('Đã xóa danh sách đoạn cắt.')};
$('montage').onclick=async()=>{
 if(segments.length<2)return;
 const total=segments.reduce((sum,p)=>sum+p.end-p.start,0);
 const limit=$('quality').value==='hd'?15:Math.min(60,P[platform][2]);
 if(total>limit){status('Tổng thời lượng '+total.toFixed(1)+'s vượt giới hạn '+limit+'s.');return}
 const base=$('api').value.trim().replace(/\/+$/,'');
 const token=$('token').value.trim();
 if(!token){status('Thiếu khóa APP_ACCESS_TOKEN trong mục ENGINE.');return}
 const auth={'X-App-Token':token};$('montage').disabled=true;
 try{
   status('Đang tải video nguồn để ghép…');
   const fd=new FormData();fd.append('file',srcFile);
   const upload=await fetch(base+'/api/media',{method:'POST',headers:auth,body:fd});
   if(!upload.ok)throw Error('Upload HTTP '+upload.status);
   const media=await upload.json();status('FFmpeg đang ghép '+segments.length+' đoạn…');
   const body={media_id:media.media_id,segments,platform,aspect:$('aspect').value,fit:$('fit').value,quality:$('quality').value};
   const response=await fetch(base+'/api/montage',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!response.ok)throw Error('Ghép video HTTP '+response.status+': '+(await response.text()).slice(0,180));
   const result=await response.json();$('json').textContent=JSON.stringify(result,null,2);
   const prefix=base+'/api/clips/'+media.media_id+'/'+result.clip_id+'/';
   for(const [kind,id,name] of [['mp4','download','HOANGGIA-montage.mp4'],['jpg','thumbnailDownload','HOANGGIA-montage.jpg']]){
     const res=await fetch(prefix+kind,{headers:auth});if(!res.ok)throw Error('Tải kết quả HTTP '+res.status);
     const link=$(id);unlink(link);link.href=URL.createObjectURL(await res.blob());link.download=name;link.hidden=false;link.textContent='↓ Tải '+(kind==='mp4'?'video ghép MP4':'thumbnail');
   }
   status('Đã ghép xong '+segments.length+' đoạn. Hãy tải MP4 để kiểm tra.');
 }catch(e){status('Chưa ghép được: '+e.message)}
 finally{showSegments()}
};

window.addEventListener('pagehide',()=>{thumbSeq++;if(url)URL.revokeObjectURL(url)});
buttons();refresh();
// Auto-connect only when UI and API share the same origin.
(async()=>{try{const r=await fetch('/api/health',{signal:AbortSignal.timeout(3000)});if(r.ok){const j=await r.json();if(j.status==='ok'){$('api').value=location.origin;refresh();$('engine-note').textContent='Đã kết nối máy chủ FFmpeg. Để xuất MP4, nhập khóa APP_ACCESS_TOKEN từ Render → Environment. Không chia sẻ khóa.';}}}catch(e){/* Browser-only preview; no backend. */}})();

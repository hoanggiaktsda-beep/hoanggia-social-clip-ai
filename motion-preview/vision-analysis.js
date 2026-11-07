// Optional vision analysis via user-supplied Gemini API key. Never persist the key.
// Selected still frames are sent to Google only after explicit user action.
export async function describeFrames(video,apiKey,{fetchImpl=fetch,signal}={}){
 if(!apiKey?.trim())throw Error('Cần nhập Gemini API key để nhận diện hình ảnh.');
 if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Video chưa sẵn sàng.');
 const originalTime=video.currentTime,wasPlaying=!video.paused;
 const shots=[];
 const seek=t=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{cleanup();reject(Error('Hết thời gian chờ khung hình'))},10000);
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',failed)};
  const done=()=>{cleanup();resolve()};
  const failed=()=>{cleanup();reject(Error('Không đọc được khung hình'))};
  video.addEventListener('seeked',done,{once:true});video.addEventListener('error',failed,{once:true});
  video.currentTime=t;
 });
 try{
  video.pause();
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,768/Math.max(video.videoWidth||1,video.videoHeight||1));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const ctx=canvas.getContext('2d');
  for(const fraction of [.12,.5,.88]){
   const time=Math.min(Math.max(0,video.duration-.05),video.duration*fraction);
   if(Math.abs(video.currentTime-time)>.025)await seek(time);
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   shots.push({inline_data:{mime_type:'image/jpeg',data:canvas.toDataURL('image/jpeg',.72).split(',')[1]}});
  }
 }finally{
  try{if(Math.abs(video.currentTime-originalTime)>.025)await seek(originalTime)}catch{}
  if(wasPlaying)video.play().catch(()=>{});
 }
 const instruction='Phân tích BA khung hình theo thứ tự thời gian. Chỉ mô tả những gì nhìn thấy, không đoán. Trả về JSON object với đúng 4 khóa string: wardrobe (trang phục, màu sắc, chất liệu chỉ khi thấy rõ), scene (bối cảnh, vật thể, ánh sáng), camera (cỡ cảnh, góc máy và bố cục; chỉ khẳng định camera di chuyển khi có bằng chứng từ nhiều khung), expression (biểu cảm quan sát được, không suy đoán cảm xúc nội tâm). Tiếng Việt. Nếu không xác định, trả chuỗi rỗng. Không nhắc video tham chiếu hoặc video gốc.';
 const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
  method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey.trim()},
  body:JSON.stringify({contents:[{parts:[{text:instruction},...shots]}],generationConfig:{responseMimeType:'application/json',temperature:0.1}}),signal
 });
 if(!response.ok)throw Error('Gemini Vision HTTP '+response.status);
 const payload=await response.json();
 const raw=payload?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 let parsed;
 try{parsed=JSON.parse(raw)}catch{throw Error('Kết quả thị giác không đúng định dạng JSON')}
 return Object.fromEntries(['wardrobe','scene','camera','expression'].map(k=>[k,typeof parsed[k]==='string'?parsed[k].slice(0,1500):'']));
}

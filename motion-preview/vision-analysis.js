// Optional vision analysis via user-supplied Gemini API key. Never persist the key.
// Selected still frames are sent to Google only after explicit user action.
export async function describeFrames(video,apiKey,{fetchImpl=fetch,signal}={}){
 if(!apiKey?.trim())throw Error('Cần nhập Gemini API key để nhận diện hình ảnh.');
 if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Video chưa sẵn sàng.');
 const originalTime=video.currentTime,wasPlaying=!video.paused;
 const shots=[];
 const frameCount=9;
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
  for(let i=0;i<frameCount;i++){
   const fraction=(i+.5)/frameCount;
   const time=Math.min(Math.max(0,video.duration-.05),video.duration*fraction);
   if(Math.abs(video.currentTime-time)>.025)await seek(time);
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   shots.push({text:'Khung '+(i+1)+'/'+frameCount+' · '+time.toFixed(2)+' giây'});
   shots.push({inline_data:{mime_type:'image/jpeg',data:canvas.toDataURL('image/jpeg',.66).split(',')[1]}});
  }
 }finally{
  try{if(Math.abs(video.currentTime-originalTime)>.025)await seek(originalTime)}catch{}
  if(wasPlaying)video.play().catch(()=>{});
 }
 const instruction='Phân tích CHÍN khung hình theo thứ tự thời gian, có nhãn thời gian ngay trước mỗi ảnh. Chỉ mô tả những gì thực sự quan sát được; không đoán chi tiết bị che khuất, không tự tạo lời thoại hay hành động. Trả về JSON object: wardrobe (string: trang phục/tóc/phụ kiện), scene (string: không gian/ánh sáng), camera (string: cỡ cảnh/góc nhìn/bố cục, không khẳng định camera chuyển động nếu không chắc), expression (string: mô tả biến thiên ánh mắt, môi, đầu khi nhìn thấy), actions (array tối đa 9 object có start và end là số giây theo thời gian video được cung cấp, action là câu tiếng Việt mô tả hành động tay/đầu/thân, face là câu mô tả nét mặt/ánh mắt nếu rõ). Phân biệt hướng trái/phải theo phía màn hình, không đoán tay giải phẫu nếu không chắc. Không thể suy ra tốc độ hoặc quỹ đạo chính xác giữa hai khung tĩnh, chỉ mô tả sự thay đổi nhìn thấy; đoạn không rõ thì bỏ qua. Nếu không xác định trả chuỗi rỗng hoặc mảng rỗng. Không nhắc video tham chiếu hay video gốc.';
 const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
  method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey.trim()},
  body:JSON.stringify({contents:[{parts:[{text:instruction},...shots]}],generationConfig:{responseMimeType:'application/json',temperature:0.1}}),signal
 });
 if(!response.ok)throw Error('Gemini Vision HTTP '+response.status);
 const payload=await response.json();
 const raw=payload?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 let parsed;
 try{parsed=JSON.parse(raw)}catch{throw Error('Kết quả thị giác không đúng định dạng JSON')}
 const result=Object.fromEntries(['wardrobe','scene','camera','expression'].map(k=>[k,typeof parsed[k]==='string'?parsed[k].slice(0,1500):'']));
 result.actions=Array.isArray(parsed.actions)?parsed.actions.slice(0,9).filter(a=>Number.isFinite(a?.start)&&Number.isFinite(a?.end)&&a.end>a.start&&a.start>=0&&a.end<=video.duration+.2).map(a=>({start:a.start,end:a.end,action:typeof a.action==='string'?a.action.slice(0,450):'',face:typeof a.face==='string'?a.face.slice(0,350):''})).filter(a=>a.action||a.face).sort((a,b)=>a.start-b.start):[];
 return result;
}

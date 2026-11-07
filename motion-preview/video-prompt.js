// Browser-only, evidence-limited video-to-prompt: no scene recognition or camera tracking.
const ok=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number(p.visibility)>=.6;
const name={0:'đầu/mũi',11:'vai trái',12:'vai phải',15:'tay trái',16:'tay phải',23:'hông trái',24:'hông phải'};
function movement(a,b,id){
 const p=a?.landmarks?.[id],q=b?.landmarks?.[id];
 if(!ok(p)||!ok(q))return null;
 const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
 if(d<.035)return null;
 const vertical=Math.abs(dy)>=Math.abs(dx);
 return (name[id]||'khớp')+' '+(vertical?(dy>0?'dịch xuống':'dịch lên'):(dx>0?'dịch sang phải khung hình':'dịch sang trái khung hình'));
}
export function buildVideoPrompt(report, visual={}, outputSeconds=10){
 const duration=Number(report?.video?.duration);
 const frames=Array.isArray(report?.frames)?report.frames.filter(f=>Number.isFinite(f?.time)).sort((a,b)=>a.time-b.time):[];
 if(!frames.length||!Number.isFinite(duration)||duration<=0)return '';
 const requested=Number(outputSeconds);
 const total=Number.isFinite(requested)?Math.max(5,Math.min(30,Math.round(requested))):10;
 const parts=Math.ceil(total/2);
 const timeline=[];
 for(let i=0;i<parts;i++){
  const start=i*total/parts,end=(i+1)*total/parts;
  const sourceStart=i*duration/parts,sourceEnd=(i+1)*duration/parts;
  const segment=frames.filter(f=>f.time>=sourceStart&&f.time<=sourceEnd);
  const first=segment.find(f=>f?.landmarks?.length===33),last=[...segment].reverse().find(f=>f?.landmarks?.length===33);
  const motions=first&&last?[0,11,12,15,16,23,24].map(id=>movement(first,last,id)).filter(Boolean):[];
  timeline.push('• '+start.toFixed(1)+'–'+end.toFixed(1)+'s: '+(motions.length?motions.slice(0,5).join('; ')+'.':'Không đủ bằng chứng để mô tả chuyển động cụ thể; giữ chuyển động tự nhiên, không tự thêm hành động lớn.'));
 }
 const aspect='dọc 9:16';
 const safe=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim():fallback;
 const detected=frames.filter(f=>f.pose_detected).length;
 return [
 'HOANGGIA AI — MASTER PROMPT VIDEO',
 'Mục tiêu: tạo video '+total+' giây; khung hình '+aspect+'.',
 'NHÂN VẬT: [mô tả nhân vật / chọn Character ID trong Flow].',
 'TRANG PHỤC: '+safe(visual.wardrobe,'Chưa xác định được trang phục bằng hệ thống phân tích hình ảnh.') ,
 'BỐI CẢNH: '+safe(visual.scene,'Chưa xác định được bối cảnh bằng hệ thống phân tích hình ảnh.') ,
 'CAMERA: '+safe(visual.camera,'Chưa xác định được góc máy và chuyển động camera từ hình ảnh.') ,
 'CHUYỂN ĐỘNG THEO TIMELINE (quan sát 2D tương đối, không phải nhận diện hành động):',
 ...timeline,
 'BIỂU CẢM: '+safe(visual.expression,'Chưa xác định được biểu cảm từ dữ liệu hiện có.') ,
 'ÂM THANH: STRICT SILENCE. Không nhạc, không thoại, không hiệu ứng âm thanh.',
 'RÀNG BUỘC: duy trì nhân dạng, trang phục, bối cảnh và góc máy xuyên suốt; chuyển động liền mạch, không biến dạng tay, mặt hoặc cơ thể; không tự thêm nhân vật/đạo cụ.',
 'LƯU Ý: Các mục chưa xác định cần được phân tích hình ảnh bổ sung trước khi tạo video. Dữ liệu chuyển động 2D không chứng minh được góc máy hoặc trang phục.'
 ].join('\n');
}

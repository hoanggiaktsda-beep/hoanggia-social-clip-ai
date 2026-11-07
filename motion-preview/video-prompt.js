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
export function buildVideoPrompt(report){
 const duration=Number(report?.video?.duration);
 const frames=Array.isArray(report?.frames)?report.frames.filter(f=>Number.isFinite(f?.time)).sort((a,b)=>a.time-b.time):[];
 if(!frames.length||!Number.isFinite(duration)||duration<=0)return '';
 const total=Math.min(duration,120),parts=Math.max(1,Math.ceil(total/2));
 const timeline=[];
 for(let i=0;i<parts;i++){
  const start=i*total/parts,end=(i+1)*total/parts;
  const segment=frames.filter(f=>f.time>=start&&f.time<=end);
  const first=segment.find(f=>f?.landmarks?.length===33),last=[...segment].reverse().find(f=>f?.landmarks?.length===33);
  const motions=first&&last?[0,11,12,15,16,23,24].map(id=>movement(first,last,id)).filter(Boolean):[];
  timeline.push('• '+start.toFixed(1)+'–'+end.toFixed(1)+'s: '+(motions.length?motions.slice(0,5).join('; ')+'.':'Không đủ bằng chứng để mô tả chuyển động cụ thể; giữ chuyển động tự nhiên, không tự thêm hành động lớn.'));
 }
 const aspect=Number(report.video.width)>0&&Number(report.video.height)>0?(report.video.height>report.video.width?'dọc 9:16 (gần đúng, kiểm tra video gốc)':'ngang (giữ tỷ lệ video gốc)'):'giữ tỷ lệ video gốc';
 const detected=frames.filter(f=>f.pose_detected).length;
 return [
 'HOANGGIA AI — MASTER PROMPT VIDEO (BẢN NHÁP TỪ PHÂN TÍCH POSE 2D)',
 'Mục tiêu: tạo video '+total.toFixed(1)+' giây; khung hình '+aspect+'.',
 'NHÂN VẬT: [mô tả nhân vật / chọn Character ID trong Flow].',
 'TRANG PHỤC: [mô tả trang phục].',
 'BỐI CẢNH: [mô tả bối cảnh theo video gốc].',
 'CAMERA: [chọn góc máy, tiêu cự, handheld hoặc cố định theo video gốc]; không suy đoán chuyển động camera từ Pose.',
 'CHUYỂN ĐỘNG THEO TIMELINE (quan sát 2D tương đối, không phải nhận diện hành động):',
 ...timeline,
 'BIỂU CẢM: [bổ sung từ quan sát video gốc; dữ liệu Face Mesh chưa được diễn giải thành cảm xúc].',
 'ÂM THANH: [giữ âm thanh gốc / STRICT SILENCE theo lựa chọn].',
 'RÀNG BUỘC: duy trì nhân dạng, trang phục, bối cảnh và góc máy xuyên suốt; chuyển động liền mạch, không biến dạng tay, mặt hoặc cơ thể; không tự thêm nhân vật/đạo cụ.',
 'ĐỘ TIN CẬY: nhận diện Pose '+detected+'/'+frames.length+' mẫu. Chỉ mô tả biến thiên điểm khớp trong ảnh; chưa thể kết luận hành động, góc quay, chiều sâu thực hoặc tái tạo 1:1.',
 'HƯỚNG DẪN: điền các trường [ ] và kiểm tra timeline với video trước khi dùng prompt trong Gemini Flow.'
 ].join('\n');
}

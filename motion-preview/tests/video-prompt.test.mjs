import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVideoPrompt} from '../video-prompt.js';
const frame=(time,x)=>({time,pose_detected:true,landmarks:Array.from({length:33},(_,id)=>({x:id===15?x:.5,y:.5,visibility:.95}))});
test('missing report returns no invented prompt',()=>{assert.equal(buildVideoPrompt(null),'');assert.equal(buildVideoPrompt({video:{duration:5},frames:[]}), '')});
test('valid 2D report yields timed, editable, evidence-limited prompt',()=>{
 const report={video:{duration:4,width:1080,height:1920},frames:[frame(0,.2),frame(1,.5),frame(2,.7),frame(3,.3)]};
 const before=JSON.stringify(report),prompt=buildVideoPrompt(report);
 assert.match(prompt,/0\.0–2\.0s/);
 assert.match(prompt,/8\.0–10\.0s/);
 assert.match(prompt,/tay trái/);
 assert.match(prompt,/Chưa xác định được bối cảnh/);
 assert.match(prompt,/Mục tiêu: tạo video 10 giây/);
 assert.doesNotMatch(prompt,/video gốc|video tham chiếu/i);
 assert.equal(JSON.stringify(report),before);
});

test('visual descriptions are incorporated when supplied by a verified vision system',()=>{
 const report={video:{duration:14.7,width:1080,height:1920},frames:[frame(0,.2),frame(14,.8)]};
 const prompt=buildVideoPrompt(report,{wardrobe:'Áo sơ mi trắng.',scene:'Phòng khách sáng.',camera:'Góc máy ngang tầm mắt.'});
 assert.match(prompt,/TRANG PHỤC: Áo sơ mi trắng/);
 assert.match(prompt,/BỐI CẢNH: Phòng khách sáng/);
 assert.match(prompt,/CAMERA: Góc máy ngang tầm mắt/);
 assert.doesNotMatch(prompt,/14\.7 giây/);
});

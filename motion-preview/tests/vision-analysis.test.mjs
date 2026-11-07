import test from 'node:test';
import assert from 'node:assert/strict';
import {describeFrames} from '../vision-analysis.js';
test('vision requires a user-supplied key',async()=>{
 await assert.rejects(describeFrames({duration:5},''),/API key/);
});
test('vision uses only 9 sampled frames and parses grounded fields',async()=>{
 const original=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,AAAA'})};
 let time=0;
 const listeners=new Map();
 const video={duration:10,videoWidth:1080,videoHeight:1920,paused:true,pause(){},addEventListener(n,cb){listeners.set(n,cb)},removeEventListener(n){listeners.delete(n)},get currentTime(){return time},set currentTime(v){time=v;queueMicrotask(()=>listeners.get('seeked')?.())}};
 let calls=0;
 try{
  const data=await describeFrames(video,'test-key',{fetchImpl:async(url,opts)=>{
   calls++;
   assert.match(url,/generativelanguage.googleapis.com/);
   assert.equal(opts.headers['x-goog-api-key'],'test-key');
   const parts=JSON.parse(opts.body).contents[0].parts;
   assert.equal(parts.filter(p=>p.inline_data).length,9);
   return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({wardrobe:'Áo trắng',scene:'Phòng khách',camera:'Trung cảnh',expression:'Mỉm cười'})}]}}]})};
  }});
  assert.equal(data.wardrobe,'Áo trắng');
  assert.equal(calls,1);
  assert.equal(time,0);
 }finally{globalThis.document=original}
});

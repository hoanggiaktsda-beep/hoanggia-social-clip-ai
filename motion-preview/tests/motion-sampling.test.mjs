import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSample,smoothPose} from '../motion-sampling.js';
test('nearest sample tolerances and deterministic duplicate timestamps',()=>{
 const frames=[{time:2},{time:1},{time:1},{time:3},{time:NaN}];
 assert.equal(selectSample(frames,1,.12)?.index,1);
 assert.equal(selectSample(frames,2.5,.12),null);
 assert.equal(selectSample(frames,NaN),null);
 assert.equal(selectSample([],1),null);
 assert.equal(selectSample(frames,3,.12)?.index,3);
});
test('smoothing does not mutate raw landmarks or fill invisible joints',()=>{
 const frames=[0,1,2].map((n)=>({time:n,landmarks:Array.from({length:33},(_,i)=>({x:n===1?10:n,y:i,z:n,visibility:i===15?.2:.95}))}));
 const before=JSON.stringify(frames);
 const result=smoothPose(frames,1);
 assert.equal(JSON.stringify(frames),before);
 assert.equal(result.landmarks[0].x,0);
 assert.equal(result.landmarks[15].x,10);
 assert.notStrictEqual(result.landmarks,frames[1].landmarks);
 assert.equal(smoothPose([],0),null);
});

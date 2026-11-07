import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../transfer-package.js',import.meta.url),'utf8');
const {transferPackage,classifyChanges}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const report={source:'sample.mp4',video:{duration:1,width:100,height:200},sampling_target_fps:5,
 frames:[{pose_detected:false,landmarks:[]}],face_tracking:{frames:[{time:0,detected:true,landmarks:[{x:.5,y:.5}]}]},
 hand_tracking:{frames:[{hands:[]}]},facial_motion:{metrics:[{time:0,mouth_open:.1}]},
 motion_quality:{flags:[]}};
const pkg=transferPackage(report);
assert.equal(pkg.samples.length,1);
assert.equal(pkg.samples[0].face[0].x,.5);
assert.equal(pkg.constraints.video_generation,false);
assert.equal(pkg.source.filename,'sample.mp4');
assert.throws(()=>transferPackage({}),/Missing/);
const hints=classifyChanges([{mouth_open:.1},{mouth_open:1},{mouth_open:.1}],[{index:1,metric:'mouth_open',time:.2,delta:.9}]);
assert.equal(hints[0].review_hint,'possible_single_frame_spike');
console.log('Transfer package tests passed');

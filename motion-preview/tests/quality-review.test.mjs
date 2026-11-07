import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=async name=>import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../'+name,import.meta.url),'utf8')).toString('base64'));
const transfer=readFileSync(new URL('../transfer-package.js',import.meta.url),'utf8');
const hand=readFileSync(new URL('../hand-quality.js',import.meta.url),'utf8');
const handUrl='data:text/javascript;base64,'+Buffer.from(hand).toString('base64');
const review=readFileSync(new URL('../quality-review.js',import.meta.url),'utf8').replace("from './transfer-package.js'","from 'data:text/javascript;base64,"+Buffer.from(transfer).toString('base64')+"'").replace("from './hand-quality.js'","from '"+handUrl+"'");
const {reviewItems,reviewedPackage}=await import('data:text/javascript;base64,'+Buffer.from(review).toString('base64'));
const points=Array.from({length:478},()=>({x:.5,y:.5}));
const report={source:'video.mp4',video:{duration:1,width:576,height:768},frames:[{pose_detected:false}],face_tracking:{frames:[{time:0,detected:true,landmarks:points}]},hand_tracking:{frames:[{time:0,hands:[{},{},{}]}]},motion_quality:{flags:[{index:0,time:0,metric:'yaw_proxy',delta:.3}]},facial_motion:{metrics:[{time:0,yaw_proxy:.1}]}};
const result=reviewItems(report);
assert.equal(result.items.length,2);
assert.throws(()=>reviewedPackage(report,{}),/chưa được đánh giá/);
const decisions=Object.fromEntries(result.items.map(i=>[i.id,'accepted']));
const pkg=reviewedPackage(report,decisions);
assert.equal(pkg.manual_review.reviewed_count,2);
assert.equal(pkg.readiness.manual_review_complete,true);
assert.equal(pkg.constraints.video_generation,false);
decisions[result.items[0].id]='rejected';
assert.equal(reviewedPackage(report,decisions).manual_review.status,'reviewed_with_issues');
console.log('Quality review dashboard tests passed');

const {handAnomalies,saveReview,restoreReview}=await import(handUrl);
const withWrist=(x,y)=>({landmarks:[{x,y}]});
const anomaly={hand_tracking:{frames:[{time:1,hands:[withWrist(.1,.1),withWrist(.11,.11),withWrist(.9,.9)]}]}};
assert.equal(handAnomalies(anomaly)[0].classification,'possible_duplicate');
assert.equal(handAnomalies(anomaly)[0].suspected_duplicates.length,1);
const store=new Map();const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
assert.equal(saveReview(storage,report,decisions),true);
assert.deepEqual(restoreReview(storage,report,result.items),decisions);
assert.deepEqual(restoreReview(storage,{...report,source:'different.mp4'},result.items),{});

const repeated={...report,motion_quality:{flags:[
 {index:72,time:14.4,metric:'yaw_proxy',delta:.2538},
 {index:73,time:14.4,metric:'yaw_proxy',delta:.2538},
 {index:74,time:14.6,metric:'yaw_proxy',delta:.28},
 {index:75,time:14.6,metric:'yaw_proxy',delta:.28},
 {index:76,time:14.6,metric:'left_eye_open',delta:.31}
]},hand_tracking:{frames:[
 {time:9.4,hands:[{},{},{}]},
 {time:9.4,hands:[{},{},{}]}
]}};
const unique=reviewItems(repeated).items;
assert.equal(unique.length,4,'same displayed timestamp and metric should be reviewed once');
assert.deepEqual(unique.map(x=>x.id),['hands-0','motion-0','motion-2','motion-4']);
assert.equal(repeated.motion_quality.flags.length,5,'raw motion warnings must remain intact');
const reviewed=reviewedPackage(repeated,Object.fromEntries(unique.map(i=>[i.id,'accepted'])));
assert.equal(reviewed.manual_review.reviewed_count,4);
console.log('Duplicate timestamp regression passed');

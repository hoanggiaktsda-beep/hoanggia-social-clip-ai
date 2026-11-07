import {assessTransferReadiness,transferPackage} from './transfer-package.js';
export function reviewItems(report){
 const ready=assessTransferReadiness(report);
 const flags=(report.motion_quality?.flags||[]).map((f,i)=>({id:'motion-'+i,index:f.index,time:f.time,kind:'motion',label:`${Number(f.time).toFixed(2)}s · ${f.metric} · Δ=${f.delta}`}));
 const hands=ready.duplicate_hand_frames.map((f,i)=>({id:'hands-'+i,index:f.index,time:f.time,kind:'hands',label:`${Number(f.time??0).toFixed(2)}s · ${f.count} bàn tay phát hiện`}));
 return {readiness:ready,items:[...flags,...hands].sort((a,b)=>(a.time??0)-(b.time??0))};
}
export function reviewedPackage(report,decisions){
 const {readiness,items}=reviewItems(report);
 const pending=items.filter(i=>!['accepted','rejected'].includes(decisions?.[i.id]));
 if(pending.length)throw Error('Còn '+pending.length+' cảnh báo chưa được đánh giá');
 const pkg=transferPackage(report);
 const rejected=items.filter(i=>decisions[i.id]==='rejected');
 pkg.manual_review={status:rejected.length||readiness.blockers.includes('face_coverage_below_90_percent')?'reviewed_with_issues':'reviewed',
  decisions:items.map(i=>({...i,decision:decisions[i.id]})),
  reviewed_count:items.length,rejected_count:rejected.length,
  warning:'Human review does not certify accuracy or enable AI generation.'};
 pkg.readiness={...pkg.readiness,manual_review_complete:true,reviewed_with_issues:pkg.manual_review.status==='reviewed_with_issues'};
 return pkg;
}

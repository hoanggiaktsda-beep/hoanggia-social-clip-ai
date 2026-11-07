const DB='hoanggia-motion-preview-session', STORE='sessions', VERSION=1;
function database(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window))return reject(Error('IndexedDB không được hỗ trợ'));
  const req=indexedDB.open(DB,VERSION);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
  req.onerror=()=>reject(req.error||Error('Không mở được IndexedDB'));
  req.onsuccess=()=>resolve(req.result);
 });
}
async function transaction(mode,action){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),req=action(tx.objectStore(STORE));
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  tx.onabort=()=>reject(tx.error||Error('Lỗi lưu phiên'));
 })}finally{db.close()}
}
export async function saveSession(file,report=null){
 if(!(file instanceof Blob))throw Error('Video không hợp lệ');
 const entry={version:1,id:'session-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),position:0,file,filename:file.name||'video.mp4',type:file.type||'video/mp4',
  size:file.size,report,updated_at:new Date().toISOString()};
 await transaction('readwrite',store=>store.put(entry,entry.id));
 await transaction('readwrite',store=>store.put(entry,'active'));
 return entry;
}
export async function loadSession(){const entry=await transaction('readonly',store=>store.get('active'));return entry?.version===1?entry:null}
export async function clearSession(){await transaction('readwrite',store=>store.delete('active'))}
export async function listSessions(){const entries=await transaction('readonly',store=>store.getAll());return entries.filter(e=>e?.id&&e.version===1).filter((e,i,a)=>a.findIndex(x=>x.id===e.id)===i).map(({id,filename,size,updated_at,report,position})=>({id,filename,size,updated_at,analyzed:!!report,position:position||0})).sort((a,b)=>b.updated_at.localeCompare(a.updated_at))}
export async function selectSession(id){const entry=await transaction('readonly',store=>store.get(id));if(!entry?.file)throw Error('Không tìm thấy phiên');await transaction('readwrite',store=>store.put(entry,'active'));return entry}
export async function deleteSession(id){await transaction('readwrite',store=>store.delete(id));const current=await loadSession();if(current?.id===id)await clearSession()}
export async function savePosition(position){const entry=await loadSession();if(!entry)return;entry.position=Math.max(0,Number(position)||0);await transaction('readwrite',store=>store.put(entry,'active'));if(entry.id)await transaction('readwrite',store=>store.put(entry,entry.id))}

export async function saveReport(report){
 const entry=await loadSession();if(!entry)return false;
 entry.report=report;entry.updated_at=new Date().toISOString();
 await transaction('readwrite',store=>store.put(entry,'active'));if(entry.id)await transaction('readwrite',store=>store.put(entry,entry.id));return true;
}

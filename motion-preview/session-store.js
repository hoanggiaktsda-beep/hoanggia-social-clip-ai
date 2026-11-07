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
 const entry={version:1,file,filename:file.name||'video.mp4',type:file.type||'video/mp4',
  size:file.size,report,updated_at:new Date().toISOString()};
 await transaction('readwrite',store=>store.put(entry,'active'));
 return entry;
}
export async function loadSession(){const entry=await transaction('readonly',store=>store.get('active'));return entry?.version===1?entry:null}
export async function clearSession(){await transaction('readwrite',store=>store.delete('active'))}
export async function saveReport(report){
 const entry=await loadSession();if(!entry)return false;
 entry.report=report;entry.updated_at=new Date().toISOString();
 await transaction('readwrite',store=>store.put(entry,'active'));return true;
}

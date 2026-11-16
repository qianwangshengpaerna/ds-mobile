/* Android host bridge. Remote pages are never loaded into this WebView. */
(() => {
  if (!window.DSNative) return;
  // Android owns the actual WebView bounds. Don't also resize a fixed DOM frame
  // from visualViewport, whose IME behavior differs across WebView versions.
  document.documentElement.setAttribute('data-ds-native', 'true');
  const native = window.DSNative, pending = new Map();
  const secure = key => key === 'chat-demo:api-key' || key === 'ds-mobile:config';
  const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
  Storage.prototype.getItem = function(key) { return this === localStorage && secure(key) ? native.getSecret(key) : get.call(this,key); };
  Storage.prototype.setItem = function(key,value) { if(this === localStorage && secure(key)) native.setSecret(key,String(value)); else set.call(this,key,value); };
  Storage.prototype.removeItem = function(key) { if(this === localStorage && secure(key)) native.removeSecret(key); else remove.call(this,key); };
  const to64 = bytes => {let out='';for(let i=0;i<bytes.length;i+=8192) out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
  window.__dsNetwork = (id,event,payload) => {
    const p=pending.get(id);if(!p)return;
    if(event==='headers') {
      p.controller = null;
      const stream = new ReadableStream({start(c){p.controller=c},cancel(){native.cancel(id);p.cleanup()}});
      p.resolve(new Response([204,205,304].includes(payload.status)?null:stream,{status:payload.status,headers:payload.headers}));
    } else if(event==='chunk') {const raw=atob(payload);p.controller?.enqueue(Uint8Array.from(raw,c=>c.charCodeAt(0)));}
    else if(event==='end') {p.controller?.close();p.cleanup();}
    else if(event==='error') {const err=new TypeError(payload);p.controller?.error(err);p.reject(err);p.cleanup();}
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input,init) => {
    const req=new Request(input,init);
    if(new URL(req.url).origin===location.origin || !req.url.startsWith('https:')) return originalFetch(input,init);
    if(req.signal.aborted) throw new DOMException('Aborted','AbortError');
    const bytes=req.method==='GET'||req.method==='HEAD'?null:new Uint8Array(await req.arrayBuffer());
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const abort=()=>{native.cancel(id);const e=new DOMException('Aborted','AbortError');const p=pending.get(id);p?.controller?.error(e);reject(e);cleanup()};
      const cleanup=()=>{pending.delete(id);req.signal.removeEventListener('abort',abort)};
      pending.set(id,{resolve,reject,cleanup,controller:null});req.signal.addEventListener('abort',abort,{once:true});
      if(req.signal.aborted){abort();return}
      native.request(id,JSON.stringify({url:req.url,method:req.method,headers:Object.fromEntries(req.headers),body:bytes?to64(bytes):null}));
    });
  };
  const fileRequests=new Map();
  window.__dsFileEvent=(id,result)=>{const callback=fileRequests.get(id);if(!callback)return;fileRequests.delete(id);if(result.ok)callback.resolve(result);else callback.reject(new Error(result.message||'文件操作失败'));};
  const fileOperation=start=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();fileRequests.set(id,{resolve,reject});try{start(id)}catch(e){fileRequests.delete(id);reject(e)}});
  if(native.exportFile){window.DSMobileFiles={
    save:(name,mime,base64)=>fileOperation(id=>native.exportFile(id,name,mime,base64)),
    directory:()=>JSON.parse(native.getExportDirectory()),
    chooseDirectory:()=>fileOperation(id=>native.chooseExportDirectory(id)),
    resetDirectory:()=>native.resetExportDirectory()
  };}
  const originalClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){
    if(this.download && this.href.startsWith('blob:')) {
      originalFetch(this.href).then(r=>r.blob()).then(async blob=>{const base64=to64(new Uint8Array(await blob.arrayBuffer()));if(window.DSMobileFiles)await window.DSMobileFiles.save(this.download,blob.type||'application/zip',base64);else native.saveFile(this.download,base64)}).catch(()=>alert('导出失败，请重试。'));
    } else originalClick.call(this);
  };
})();

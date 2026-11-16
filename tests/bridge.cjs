const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {JSDOM}=require('../upstream/node_modules/jsdom');const dom=new JSDOM('<!doctype html><body/>',{url:'https://ds.mobile.local',runScripts:'outside-only'});const w=dom.window;const secrets=new Map();let request,aborted;let hanging=false;
Object.assign(w,{Request,Response,ReadableStream,fetch,TextEncoder,TextDecoder});
w.DSNative={getSecret:k=>secrets.get(k)??null,setSecret:(k,v)=>secrets.set(k,v),removeSecret:k=>secrets.delete(k),cancel:id=>aborted=id,request:(id,json)=>{request=JSON.parse(json);if(hanging)return;setImmediate(()=>{w.__dsNetwork(id,'headers',{status:200,headers:{'Content-Type':'text/plain'}});const bytes=Buffer.from('中文流式响应');w.__dsNetwork(id,'chunk',bytes.subarray(0,4).toString('base64'));w.__dsNetwork(id,'chunk',bytes.subarray(4).toString('base64'));w.__dsNetwork(id,'end','')})}};
w.eval(fs.readFileSync(path.join(__dirname,'../upstream/public/native.js'),'utf8'));
(async()=>{
 assert.equal(w.document.documentElement.getAttribute('data-ds-native'),'true');
 w.localStorage.setItem('chat-demo:api-key','secret');assert.equal(secrets.get('chat-demo:api-key'),'secret');assert.equal(w.localStorage.getItem('chat-demo:api-key'),'secret');assert.equal(w.localStorage.length,0);w.localStorage.setItem('ordinary','x');assert.equal(w.localStorage.getItem('ordinary'),'x');
 const r=await w.fetch('https://api.deepseek.com/models',{headers:{Authorization:'Bearer secret'}});assert.equal(await r.text(),'中文流式响应');assert.equal(request.headers.authorization,'Bearer secret');
 const form=new FormData();form.append('file',new Blob(['hello'],{type:'text/plain'}),'test.txt');await (await w.fetch('https://api.deepseek.com/anthropic/v1/files',{method:'POST',body:form})).text();assert.ok(request.headers['content-type'].startsWith('multipart/form-data; boundary='));assert.ok(Buffer.from(request.body,'base64').toString().includes('test.txt'));
 hanging=true;const c=new AbortController();const p=w.fetch('https://api.deepseek.com/models',{signal:c.signal});c.abort();await assert.rejects(p,e=>e.name==='AbortError');assert.ok(aborted);
 console.log('PASS: native JavaScript bridge; secret storage routing; split UTF-8 streaming; multipart uploads; request cancellation.');
})().catch(e=>{console.error(e);process.exit(1)});

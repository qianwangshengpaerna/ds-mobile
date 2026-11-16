const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const deps=path.join(__dirname,'../upstream/node_modules');require(path.join(deps,'fake-indexeddb/auto'));
const {JSDOM}=require(path.join(deps,'jsdom'));const dom=new JSDOM('<!doctype html><body/>',{url:'https://ds.mobile.local'});
for(const k of ['window','document','localStorage','navigator'])Object.defineProperty(global,k,{value:dom.window[k],configurable:true});
global.requestAnimationFrame=fn=>setTimeout(fn,0);global.cancelAnimationFrame=clearTimeout;window.matchMedia=()=>({matches:false});
const app=require('./bundle.cjs');
const fixture=name=>new File([fs.readFileSync(path.join(__dirname,'fixtures',name))],name,{type:'application/zip'});
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out')};
(async()=>{
 await app.initChat();assert.equal(await app.importHistory(fixture('official-format-v3.zip')),1);
 const sessions=await app.db.loadSessionSummaries();assert.equal(sessions.length,1);let session=await app.db.loadSession(sessions[0].id);
 assert.equal(session.messages.length,3);const visible=app.getVisibleMessages(session);assert.equal(visible.length,2);assert.equal(visible[1].blocks[0].text,'历史回答，当前分支二。');
 const f=await app.db.loadFile(visible[0].files[0].id);assert.ok(f.size>0);assert.equal(f.type,'image/png');
 const original=JSON.stringify(session);
 for(const name of ['unsupported-version.zip','invalid-index.zip','truncated.zip']){await assert.rejects(()=>app.importHistory(fixture(name)));assert.equal(JSON.stringify(await app.db.loadSession(session.id)),original);}
 const exported=await app.exportHistory();assert.ok(exported.blob.size>0);await app.importHistory(new File([exported.blob],'roundtrip.zip'));session=await app.db.loadSession((await app.db.loadSessionSummaries())[0].id);assert.equal(session.messages.length,3);
 app.updateMobile({provider:'gemini',geminiKey:'test-key',projects:[{id:'study',name:'学习',instruction:'请先给结论'}],selected:'study'});
 let received;
 global.fetch=async(url,init)=>{received={url,init,body:JSON.parse(init.body)};return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Gemini 测试通过'}]},finishReason:'STOP'}]})+'\n\n',{headers:{'Content-Type':'text/event-stream'}})};
 app.newChat();app.setDraftText(null,'你好');assert.equal(app.sendMessage(null),true);const id=app.useChatStore.getState().activeId;
 await wait(()=>!Object.hasOwn(app.useChatStore.getState().streaming,id));const reply=app.useChatStore.getState().sessionCache[id].messages.at(-1);
 assert.equal(reply.status,'done',JSON.stringify(reply));assert.equal(reply.blocks[0].text,'Gemini 测试通过');assert.equal(app.useMobile.getState().assignments[id],'study');assert.equal(received.init.headers['x-goog-api-key'],'test-key');assert.ok(received.body.systemInstruction.parts[0].text.includes('请先给结论'));
 // Truncated Gemini streams must fail instead of presenting a complete answer.
 global.fetch=async()=>new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'partial'}]}}]})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 const request={model:'gemini-2.5-flash',system:'test',messages:[{role:'user',content:'hello'}],thinking:{type:'disabled'},tools:[],safety_check:{level:'high'}};
 await assert.rejects(async()=>{for await(const event of app.streamGemini(request,new AbortController().signal)){}},/提前结束/);
 // Real MCP transport logic with protocol-level mocks, including initialized notice and sessions.
 let calls=[];global.fetch=async(url,init)=>{const msg=JSON.parse(init.body);calls.push({msg,headers:init.headers});const result=msg.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:msg.method==='tools/list'?{tools:[{name:'echo',inputSchema:{type:'object',properties:{text:{type:'string'}}}}]}:{content:[{type:'text',text:msg.params.arguments?.text}]};return msg.method==='notifications/initialized'?new Response(null,{status:202}):new Response(JSON.stringify({jsonrpc:'2.0',id:msg.id,result}),{headers:{'Content-Type':'application/json','Mcp-Session-Id':'test-session'}})};
 const plugin={id:'fixture',name:'Fixture',url:'https://example.com/mcp',token:'plugin-token'};assert.equal((await app.listTools(plugin))[0].name,'echo');assert.equal((await app.callTool(plugin,'echo',{text:'OK'})).content[0].text,'OK');assert.equal(calls[2].headers['Mcp-Session-Id'],'test-session');assert.equal(calls[2].headers.Authorization,'Bearer plugin-token');assert.deepEqual(calls.map(c=>c.msg.method),['initialize','notifications/initialized','tools/list','tools/call']);
 console.log('PASS: official v3 ZIP import; image original; selected message branch; 3 corrupt/unsupported archives preserve old records; ZIP export/reimport; project assignment + instruction; Gemini streaming; truncated stream; MCP initialization/list/call/session.');
})().catch(e=>{console.error(e);process.exit(1)});

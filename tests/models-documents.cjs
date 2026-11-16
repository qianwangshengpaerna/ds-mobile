const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const deps=path.join(__dirname,'../upstream/node_modules');const {JSDOM}=require(path.join(deps,'jsdom'));const dom=new JSDOM('<body/>',{url:'https://ds.mobile.local'});
for(const k of ['window','document','localStorage','navigator'])Object.defineProperty(global,k,{value:dom.window[k],configurable:true});
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
const app=require('./bundle.cjs');
(async()=>{
 let requests=[];global.fetch=async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({data:[{id:'deepseek-flash',name:'DeepSeek Flash',output_modalities:['text']},{id:'deepseek-v4-pro',name:'DeepSeek Pro',output_modalities:['text']}]}),{headers:{'Content-Type':'application/json'}})};
 assert.equal((await app.readModels('deepseek','sk-test')).length,2);assert.equal(requests[0].init.headers.Authorization,'Bearer sk-test');
 let page=0;global.fetch=async(url,init)=>{requests.push({url,init});page++;return new Response(JSON.stringify(page===1?{models:[{name:'models/gemini-2.5-flash',displayName:'Flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-embedding-001',supportedGenerationMethods:['embedContent']},{name:'models/gemini-2.5-flash-image',supportedGenerationMethods:['generateContent']}],nextPageToken:'next token'}:{models:[{name:'models/gemini-2.5-pro',displayName:'Pro',supportedGenerationMethods:['generateContent']}]}),{headers:{'Content-Type':'application/json'}})};
 const models=await app.readModels('gemini','google-key');assert.deepEqual(models.map(m=>m.id),['gemini-2.5-flash','gemini-2.5-pro']);assert.ok(requests.at(-1).url.includes('pageToken=next%20token'));assert.equal(requests.at(-1).init.headers['x-goog-api-key'],'google-key');
 global.fetch=async()=>new Response(JSON.stringify({error:{message:'Invalid key'}}),{status:401});await assert.rejects(()=>app.readModels('deepseek','bad'),/Invalid key/);await assert.rejects(()=>app.readModels('gemini',''),/API Key/);
 assert.deepEqual(app.cacheStats([{id:'a',role:'assistant',model:'deepseek-flash',status:'done',usage:{input_tokens:2000,cache_read_input_tokens:6000,cache_creation_input_tokens:0,output_tokens:100}}]),{total:8000,hit:6000,fresh:2000,created:0,rate:75,model:'deepseek-flash'});assert.equal(app.cacheStats([]),null);
 assert.equal(app.cacheStats([{role:'assistant',status:'streaming',usage:{input_tokens:1}}]),null);
 app.updateMobile({geminiKey:'key'});global.fetch=async()=>new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'hello'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:8000,cachedContentTokenCount:6000,candidatesTokenCount:100}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 const events=[];for await(const e of app.streamGemini({model:'gemini-2.5-flash',system:'x',messages:[{role:'user',content:'x'}],thinking:{type:'disabled'},tools:[],safety_check:{level:'high'}},new AbortController().signal)){events.push(e)}const usage=events.find(e=>e.type==='message_delta').usage;assert.equal(usage.input_tokens,2000);assert.equal(usage.cache_read_input_tokens,6000);
 const output=path.join(__dirname,'../../qa-keyboard/document-tests');fs.mkdirSync(output,{recursive:true});
 for(const format of ['docx','xlsx','pdf']){const text=format==='xlsx'?'任务\t负责人\t数量\n需求整理\t小王\t12\n预算\t小李\t25.5':'# 项目说明\n这是一份中文测试文档。\n\n## 下一步\n请在本地保存文件。\n'+'自动换行和分页测试。'.repeat(250);const blob=await app.createDocument(format,'文档测试',text,format==='pdf'?new Uint8Array(fs.readFileSync(path.join(__dirname,'../upstream/public/document-font.otf'))):undefined);fs.writeFileSync(path.join(output,'test.'+format),Buffer.from(await blob.arrayBuffer()));assert.ok(blob.size>500);}
 assert.deepEqual(app.tableRows('name,note\n"a,b","quoted ""text"""'),[['name','note'],['a,b','quoted "text"']]);
 assert.equal(app.safeDocumentName('../中文/计划.docx','docx'),'_中文_计划.docx');
 console.log('PASS: live-model protocol mocks, Gemini pagination/filtering, key errors; exact cache accounting; editable DOCX/XLSX and paginated Chinese PDF generated.');
})().catch(e=>{console.error(e);process.exit(1)});

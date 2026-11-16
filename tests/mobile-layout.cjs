// Render the production bundle in Chromium. This simulates Android resizing the
// WebView's physical bounds; it is not a real Android IME / device test.
let playwright;
try { playwright = require('../upstream/node_modules/playwright'); } catch { playwright = require('playwright'); }
const {chromium}=playwright;
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const output=process.env.DS_LAYOUT_OUTPUT||path.join(root,'..','qa-keyboard');
(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_HEADLESS_PATH,
  headless:true,args:['--no-sandbox','--no-zygote','--single-process','--in-process-gpu','--disable-dev-shm-usage']
 });
 try{
  const context=await browser.newContext({viewport:{width:412,height:860},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://ds.mobile.local/**',async route=>{
   const relative=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'')||'index.html';
   assert.ok(!relative.includes('..'));
   const type=relative.endsWith('.js')?'application/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':relative.endsWith('.woff2')?'font/woff2':'application/octet-stream';
   try{await route.fulfill({status:200,contentType:type,body:await fs.readFile(path.join(root,'upstream/dist',relative))});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.addInitScript(()=>{
   const secrets=new Map();
   window.DSNative={getSecret:k=>secrets.get(k)??null,setSecret:(k,v)=>secrets.set(k,v),removeSecret:k=>secrets.delete(k),cancel(){},request(){throw Error('No live API allowed in layout regression')},allowHost(){}};
  });
  await fs.mkdir(output,{recursive:true});
  await page.goto('https://ds.mobile.local/');
  await page.getByText('灵感，从这里开始').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-ds-native'),'true');
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const metrics=[];
  async function assertComposer(label,height){
   await settle();
   const textarea=await page.getByPlaceholder('请输入消息').boundingBox();
   const send=await page.getByRole('button',{name:'发送',exact:true}).boundingBox();
   const menu=await page.getByRole('button',{name:'打开边栏',exact:true}).boundingBox();
   assert.ok(textarea.height>=24,`${label} textarea collapsed: ${JSON.stringify(textarea)}`);
   assert.ok(textarea.y>=64,`${label} textarea overlaps header`);
   assert.ok(send.y+send.height<=height,`${label} send button behind keyboard: ${JSON.stringify(send)}`);
   assert.ok(send.y>=textarea.y,`${label} send button overlaps text field`);
   assert.ok(menu.y>=9,`${label} menu too high: ${menu.y}`);
   assert.equal(await page.evaluate(()=>document.activeElement.tagName),'TEXTAREA',`${label} lost focus`);
   assert.equal(await page.evaluate(()=>window.scrollY),0,`${label} page panned`);
   const state=await page.locator('main').evaluate(el=>({height:el.parentElement.style.getPropertyValue('--app-viewport-height'),position:getComputedStyle(el.parentElement).position}));
   assert.equal(state.height,'',`${label} duplicated viewport owner`);assert.equal(state.position,'absolute');
   metrics.push({label,height,textarea,send,menu});
  }
  async function checkKeyboardCycle(prefix){
   await page.getByPlaceholder('请输入消息').focus();
   for(const height of [860,710,590,470,420,470,650,860]){
    await page.setViewportSize({width:412,height});
    await assertComposer(`${prefix}-${height}`,height);
    if(height===470)await page.screenshot({path:path.join(output,`${prefix}-keyboard.png`)});
   }
   await page.screenshot({path:path.join(output,`${prefix}-closed.png`)});
  }
  await checkKeyboardCycle('welcome');
  // Use the real database schema to render an existing conversation.
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('chat-demo');request.onsuccess=()=>resolve(request.result);request.onerror=reject});
   const tx=db.transaction(['sessions','sessionSummaries'],'readwrite');
   const now=Date.now();const session={id:'layout-fixture',title:'布局回归测试',createdAt:now,updatedAt:now,rootMessageId:'u1',messages:[{id:'u1',role:'user',content:'检查键盘与输入框的位置',files:[],createdAt:now,parentId:null,selectedChildId:'a1'},{id:'a1',role:'assistant',createdAt:now,model:'deepseek-flash',prefix:true,status:'done',parentId:'u1',blocks:[{type:'text',text:'这是一条用于检查布局的本地测试回答。'}]}]};
   tx.objectStore('sessions').put(session);tx.objectStore('sessionSummaries').put({id:session.id,title:session.title,createdAt:now,updatedAt:now,fileIds:[]});
   await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=j});db.close();
  });
  await page.reload();await page.getByText('灵感，从这里开始').waitFor();
  await page.getByRole('button',{name:'打开边栏',exact:true}).click();
  await page.getByText('布局回归测试',{exact:true}).click();
  await page.getByText('这是一条用于检查布局的本地测试回答。',{exact:true}).waitFor();
  await checkKeyboardCycle('conversation');
  // A high keyboard / landscape height must still leave the composer usable.
  await page.setViewportSize({width:780,height:330});await settle();
  const send=await page.getByRole('button',{name:'发送',exact:true}).boundingBox();assert.ok(send.y+send.height<=330,'landscape composer covered');
  await page.setViewportSize({width:412,height:470});await settle();
  await page.getByRole('button',{name:/^DeepSeek/}).click();
  const dialog=await page.getByRole('dialog').boundingBox();assert.ok(dialog.y>=0&&dialog.y+dialog.height<=470,`settings overflow: ${JSON.stringify(dialog)}`);
  await page.getByLabel('Gemini API Key').focus();await settle();
  assert.equal(errors.length,0,errors.join('\n'));
  await fs.writeFile(path.join(output,'layout-metrics.json'),JSON.stringify(metrics,null,2));
  console.log('PASS: production Chromium layout; 16 keyboard resize frames across welcome/conversation; input focus + header position; landscape; settings bounds.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

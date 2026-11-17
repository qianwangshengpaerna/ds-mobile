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
  const sidebarToggle = page.getByRole('button', {name:'打开边栏', exact:true});
  const sidebarId = await sidebarToggle.getAttribute('aria-controls');
  assert.ok(sidebarId, 'sidebar toggle must identify the drawer');
  const sidebar = page.locator(`#${sidebarId}`);

  async function recordSidebarMotion(open) {
   return page.evaluate(async ({id,open}) => {
    const drawer = document.getElementById(id);
    const trigger = document.querySelector(`button[aria-controls="${id}"]`);
    const backdrop = drawer.previousElementSibling;
    const main = document.querySelector('main');
    const measure = () => ({
     x: drawer.getBoundingClientRect().x,
     backdrop: Number(getComputedStyle(backdrop).opacity),
     visibility: getComputedStyle(drawer).visibility,
     mainWidth: main.getBoundingClientRect().width,
    });
    const frames = [measure()];
    (open ? trigger : backdrop).click();
    for (let i = 0; i < 40; i++) {
     await new Promise(resolve => requestAnimationFrame(resolve));
     const frame = measure();
     frames.push(frame);
     if (open ? frame.x === 0 && frame.backdrop === 1 : frame.visibility === 'hidden') break;
    }
    return frames;
   }, {id:sidebarId,open});
  }

  const opening = await recordSidebarMotion(true);
  const closedX = opening[0].x;
  const midSlide = (frame) => frame.x > closedX + 1 && frame.x < -1;
  assert.ok(opening.some(midSlide), 'drawer skipped the opening slide');
  assert.ok(opening.some(frame => frame.backdrop > 0 && frame.backdrop < 1), 'backdrop skipped the fade');
  assert.equal(opening.at(-1).x, 0);
  assert.equal(await page.locator('main').evaluate(el => el.inert), true);
  assert.equal(await sidebar.getAttribute('role'), 'dialog');

  const closing = await recordSidebarMotion(false);
  assert.ok(closing.some(midSlide), 'drawer skipped the closing slide');
  assert.equal(closing.at(-1).visibility, 'hidden');
  assert.ok([...opening,...closing].every(frame => frame.mainWidth === opening[0].mainWidth),
   'drawer resized the chat while moving');
  assert.equal(await sidebar.evaluate(el => el.inert), true);
  assert.equal(await sidebarToggle.evaluate(el => el === document.activeElement), true);

  // Reverse a closing transition while the drawer is still partway across the page.
  await sidebarToggle.click();
  await page.waitForFunction(id => document.getElementById(id).getBoundingClientRect().x === 0, sidebarId);
  const reversed = await page.evaluate(async id => {
   const drawer = document.getElementById(id);
   const trigger = document.querySelector(`button[aria-controls="${id}"]`);
   document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
   for (let i = 0; i < 20; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const currentX = drawer.getBoundingClientRect().x;
    if (currentX < -20 && currentX > -250) {
     trigger.click();
     await new Promise(resolve => requestAnimationFrame(resolve));
     return {currentX, nextX:drawer.getBoundingClientRect().x};
    }
   }
   throw new Error('No intermediate position found during closing');
  }, sidebarId);
  assert.ok(Math.abs(reversed.nextX - reversed.currentX) < 90, 'drawer jumped during reversal');
  await page.waitForFunction(id => document.getElementById(id).getBoundingClientRect().x === 0, sidebarId);
  await page.keyboard.press('Escape');
  await sidebar.waitFor({state:'hidden'});

  await page.emulateMedia({reducedMotion:'reduce'});
  await sidebarToggle.click();
  assert.equal(await sidebar.evaluate(el => getComputedStyle(el).transitionDuration), '0s, 0s');
  assert.equal(await sidebar.evaluate(el => el.getBoundingClientRect().x), 0);
  await page.keyboard.press('Escape');
  assert.equal(await sidebar.evaluate(el => getComputedStyle(el).visibility), 'hidden');
  await page.emulateMedia({reducedMotion:'no-preference'});

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
   for(let i=1;i<=24;i++){
    tx.objectStore('sessionSummaries').put({id:`sidebar-fixture-${i}`,title:`侧栏会话 ${i}`,createdAt:now-i,updatedAt:now-i,fileIds:[]});
   }
   await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=j});db.close();
  });
  await page.reload();await page.getByText('灵感，从这里开始').waitFor();
  await sidebarToggle.click();
  const scrollPosition = await sidebar.evaluate(el => {
   const list = [...el.querySelectorAll('div')].find(node => getComputedStyle(node).overflowY === 'auto');
   list.scrollTop = 360;
   return list.scrollTop;
  });
  assert.ok(scrollPosition > 0, 'session list should be scrollable');
  await page.keyboard.press('Escape');
  await sidebar.waitFor({state:'hidden'});
  await sidebarToggle.click();
  assert.equal(await sidebar.evaluate(el => [...el.querySelectorAll('div')].find(node => getComputedStyle(node).overflowY === 'auto').scrollTop), scrollPosition);
  await sidebar.evaluate(el => { [...el.querySelectorAll('div')].find(node => getComputedStyle(node).overflowY === 'auto').scrollTop = 0; });
  await page.getByText('布局回归测试',{exact:true}).click();
  await sidebar.waitFor({state:'hidden'});
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
  console.log('PASS: drawer slide, backdrop fade, reversal, reduced motion and scroll retention; production layout at 16 keyboard heights, landscape and settings.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

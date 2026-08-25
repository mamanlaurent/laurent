const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
const FILE='file://'+path.resolve('wrapped-seed.html');
let fails=[];
function ok(c,msg){ console.log((c?'  ok  ':'  FAIL')+'  '+msg); if(!c) fails.push(msg); }

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
  console.log('\n=== '+dev.name+' ===');
  const ctx=await b.newContext({viewport:dev.viewport,isMobile:dev.isMobile,hasTouch:dev.hasTouch,userAgent:dev.userAgent});
  await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
  const pg=await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(400);

  await pg.waitForSelector('#loginForm');
  await pg.selectOption('#loginName',{index:0});
  await pg.type('#loginPin','1234',{delay:20});
  await pg.click('#loginForm button[type=submit]');
  await pg.waitForTimeout(500);

  // ---- create a shipment from the slip
  await pg.click('#btnNewShipment'); await pg.waitForTimeout(300);
  await pg.type('#nsClient','Needmaj',{delay:15});
  await pg.type('#nsContainer','MSKU7734120',{delay:15});
  await pg.type('#nsPO','PO-88421',{delay:15});
  await pg.setInputFiles('#nsFile', path.resolve('needmaj-full.xlsx'));
  await pg.waitForTimeout(1500);
  await pg.click('#saveNewShip'); await pg.waitForTimeout(1500);
  if(!(await pg.$('#scanInput'))){ await pg.evaluate(()=>{const r=[...document.querySelectorAll('[data-open-ship]')].find(x=>/MSKU7734120/.test(x.textContent||'')); (r||document.querySelector('[data-open-ship]')).click();}); await pg.waitForTimeout(500); }
  ok(!!(await pg.$('#scanInput')),'shipment detail open with scan field');

  // ---- scan an unknown barcode -> enrollment panel
  await pg.click('#scanInput');
  await pg.type('#scanInput','0123456789012',{delay:10});
  await pg.press('#scanInput','Enter');
  await pg.waitForTimeout(600);
  const enrollOpen=await pg.evaluate(()=>{const p=document.querySelector('#enrollPanel');return !!(p&&p.offsetParent);});
  ok(enrollOpen,'unknown barcode opens the enrollment panel');

  // ---- enrollment filter must survive real typing
  if(enrollOpen && await pg.$('#enrollFilter')){
    await pg.click('#enrollFilter');
    await pg.type('#enrollFilter','Vanilla',{delay:60});
    await pg.waitForTimeout(400);
    const v=await pg.inputValue('#enrollFilter');
    ok(v==='Vanilla','enrollment filter keeps typed text (got "'+v+'")');
  }

  // ---- bind the barcode to the Vanilla line
  await pg.evaluate(()=>{
    const b=[...document.querySelectorAll('#enrollPanel [data-enroll-sku]')]
      .find(x=>/Vanilla/i.test(x.textContent||''));
    if(b) b.click();
  });
  await pg.waitForTimeout(700);
  let cnt=await pg.evaluate(()=>document.querySelectorAll('#shipments .shipment[data-container="MSKU7734120"] .scan:not([data-void="true"])').length);
  ok(cnt===1,'enrolling the barcode counts the box (scans='+cnt+')');

  // ---- the same barcode now counts instantly, no panel
  for(let i=0;i<3;i++){
    await pg.click('#scanInput');
    await pg.type('#scanInput','0123456789012',{delay:5});
    await pg.press('#scanInput','Enter');
    await pg.waitForTimeout(300);
  }
  cnt=await pg.evaluate(()=>document.querySelectorAll('#shipments .shipment[data-container="MSKU7734120"] .scan:not([data-void="true"])').length);
  ok(cnt===4,'a known barcode counts with no clicking between boxes (scans='+cnt+')');
  const stillOpenPanel=await pg.evaluate(()=>{const p=document.querySelector('#enrollPanel');return !!(p&&p.offsetParent);});
  ok(!stillOpenPanel,'known barcode does not reopen the enrollment panel');

  // ---- pallet notes must not be truncated by the refocus timer
  await pg.click('#palletNotes');
  await pg.fill('#palletNotes','');           // clear the slip's pre-fill, then type for real
  await pg.type('#palletNotes','PLT-01 through PLT-28',{delay:70});
  await pg.waitForTimeout(500);
  const notesVal=await pg.inputValue('#palletNotes');
  ok(notesVal==='PLT-01 through PLT-28','pallet notes survive typing (got "'+notesVal+'")');
  await pg.fill('#palletCount','28');
  await pg.click('#btnSavePallets'); await pg.waitForTimeout(600);
  const savedPal=await pg.evaluate(()=>{const s=document.querySelector('#shipments .shipment[data-container="MSKU7734120"]');return [s.getAttribute('data-pallets'),s.getAttribute('data-palletnotes')];});
  ok(savedPal[0]==='28'&&savedPal[1]==='PLT-01 through PLT-28','Save button stores pallets and notes: '+JSON.stringify(savedPal));

  // ---- persistence: reload and check the data came back
  await pg.waitForTimeout(600);
  await pg.reload(); await pg.waitForTimeout(900);
  const afterReload=await pg.evaluate(()=>{
    const s=document.querySelector('#shipments .shipment[data-container="MSKU7734120"]');
    return s? {pallets:s.getAttribute('data-pallets'),scans:s.querySelectorAll('.scan').length,lines:s.querySelectorAll('.line').length}:null;
  });
  ok(afterReload && afterReload.lines===10 && afterReload.scans===4 && afterReload.pallets==='28',
     'data survives a reload: '+JSON.stringify(afterReload));

  // ---- report filters must survive real typing
  await pg.waitForSelector('#loginForm').catch(()=>{});
  if(await pg.$('#loginForm')){
    await pg.selectOption('#loginName',{index:0});
    await pg.type('#loginPin','1234',{delay:20});
    await pg.click('#loginForm button[type=submit]');
    await pg.waitForTimeout(500);
  }
  await pg.evaluate(()=>{
    const b=[...document.querySelectorAll('[data-nav="reports"]')].find(x=>x.offsetParent);
    if(b) b.click();
  });
  await pg.waitForTimeout(600);
  await pg.click('#rfContainer');
  await pg.type('#rfContainer','MSKU7734120',{delay:60});
  await pg.waitForTimeout(500);
  const rf=await pg.inputValue('#rfContainer');
  ok(rf==='MSKU7734120','container filter keeps typed text (got "'+rf+'")');
  const hits=await pg.evaluate(()=>document.querySelectorAll('#reportResults tbody tr[data-open-ship], #reportResults tbody tr').length);
  ok(hits>=1,'container search finds the shipment ('+hits+' row(s))');
  await pg.fill('#rfContainer','NOSUCHCONTAINER'); await pg.waitForTimeout(400);
  const empty=await pg.textContent('#reportResults');
  ok(/no shipment|nothing|no result/i.test(empty)||!/MSKU7734120/.test(empty),'a non-matching search returns nothing');

  ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
  await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - ') : 'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(500);};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
 console.log('\n=== '+dev.name+' ===');
 const ctx=await b.newContext(dev);
 await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(600);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:20});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);

 // ---- 1. Customer ID on the NEW shipment form, alongside Container
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 ok(!!(await pg.$('#nsContainer')),'new shipment has Container #');
 ok(!!(await pg.$('#nsCustId')),'new shipment has Customer ID');
 ok(!!(await pg.$('#nsInvNo')),'new shipment has Invoice No.');
 await pg.fill('#nsClient','Acme Imports');
 await pg.type('#nsContainer','CONT-777',{delay:8});
 await pg.type('#nsCustId','CU-4242',{delay:8});
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1500);
 const cust=await pg.evaluate(()=>{const c=[...document.querySelectorAll('#clients .client')].find(x=>x.getAttribute('data-name')==='Acme Imports');
   return c&&c.getAttribute('data-custid');});
 ok(cust==='CU-4242','Customer ID typed at creation is saved on the client (got '+cust+')');

 // ---- 2. Edit shipment details shows and edits Container + Customer ID
 if(!(await pg.$('#scanInput'))){ await pg.click('[data-open-ship]'); await pg.waitForTimeout(600); }
 const editBtn=await pg.$('#btnEditHeader') || await pg.$('[id*=EditHead]');
 await pg.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/edit/i.test(x.textContent||'')&&/detail|shipment/i.test(x.textContent||'')||x.id==='btnEditHeader'); if(b)b.click();});
 await pg.waitForTimeout(500);
 if(!(await pg.$('#ehContainer'))){
   await pg.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\s*Edit/i.test(x.textContent||'')); if(b)b.click();});
   await pg.waitForTimeout(500);
 }
 ok(!!(await pg.$('#ehContainer')),'edit-details shows Container #');
 ok(!!(await pg.$('#ehCustId')),'edit-details shows Customer ID');
 ok(!!(await pg.$('#ehInvNo')),'edit-details shows Invoice No.');
 ok(await pg.inputValue('#ehContainer')==='CONT-777','Container is pre-filled with the real value');
 ok(await pg.inputValue('#ehCustId')==='CU-4242','Customer ID is pre-filled from the client');
 await pg.fill('#ehCustId','CU-9999');
 await pg.fill('#ehContainer','CONT-888');
 await pg.click('#saveEditHead'); await pg.waitForTimeout(900);
 const after=await pg.evaluate(()=>{
   const c=[...document.querySelectorAll('#clients .client')].find(x=>x.getAttribute('data-name')==='Acme Imports');
   const s=document.querySelector('#shipments .shipment');
   return {cust:c&&c.getAttribute('data-custid'), cont:s&&s.getAttribute('data-container')};
 });
 ok(after.cust==='CU-9999' && after.cont==='CONT-888','both edits saved: '+JSON.stringify(after));

 // ---- 3. employees are editable
 await nav(pg,'users');
 ok(!!(await pg.$('[data-edit-emp]')),'employees have an Edit button');
 await pg.evaluate(()=>{
   const rows=[...document.querySelectorAll('#roster .employee')];
   const notOwner=rows.find(r=>r.getAttribute('data-owner')!=='true');
   document.querySelector('[data-edit-emp="'+notOwner.getAttribute('data-rid')+'"]').click();
 });
 await pg.waitForTimeout(500);
 ok(!!(await pg.$('#empName')),'the edit form opens');
 await pg.fill('#empName','Marc Tremblay');
 await pg.selectOption('#empRole','admin');
 await pg.click('#saveEmpModal'); await pg.waitForTimeout(800);
 const emp=await pg.evaluate(()=>[...document.querySelectorAll('#roster .employee')]
   .map(e=>({n:e.getAttribute('data-name'), r:e.getAttribute('data-role')})));
 ok(emp.some(e=>e.n==='Marc Tremblay' && e.r==='admin'),'name and role changed: '+JSON.stringify(emp));
 const aud=await pg.evaluate(()=>[...document.querySelectorAll('#auditLog .entry')]
   .filter(e=>e.getAttribute('data-action')==='edit-user').map(e=>e.getAttribute('data-detail')));
 ok(aud.length===1,'the rename is in the audit trail: '+aud[0]);

 // owner role is protected
 await pg.evaluate(()=>{
   const owner=[...document.querySelectorAll('#roster .employee')].find(r=>r.getAttribute('data-owner')==='true');
   document.querySelector('[data-edit-emp="'+owner.getAttribute('data-rid')+'"]').click();
 });
 await pg.waitForTimeout(500);
 ok(await pg.isDisabled('#empRole'),'the owner cannot be demoted');
 await pg.click('#cancelEmpModal'); await pg.waitForTimeout(300);

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

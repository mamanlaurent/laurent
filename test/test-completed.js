const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(500);};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1400,height:900}});
 await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(500);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:20});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);

 // client WITHOUT letterhead fields — exactly how an existing client looks today
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Plain Client');
 await pg.type('#nsContainer','DONE-1',{delay:8});
 await pg.setInputFiles('#nsFile', path.resolve('needmaj-full.xlsx'));
 await pg.waitForTimeout(1500);
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1600);
 if(!(await pg.$('#scanInput'))){ await pg.click('[data-open-ship]'); await pg.waitForTimeout(600); }

 // COMPLETE it (with discrepancies, as a real short shipment)
 await pg.click('#btnComplete'); await pg.waitForTimeout(600);
 const chk=await pg.$('#confirmDiscrepancy'); if(chk){ await chk.check(); await pg.waitForTimeout(200); }
 await pg.click('#confirmComplete'); await pg.waitForTimeout(1800);
 const status=await pg.evaluate(()=>{const s=[...document.querySelectorAll('#shipments .shipment')].find(x=>x.getAttribute('data-container')==='DONE-1'); return s&&s.getAttribute('data-status');});
 ok(status==='Completed','shipment is Completed (got '+status+')');

 // now export, exactly as the user would
 if(!(await pg.$('#btnExportShipment'))){
   await nav(pg,'shipments');
   await pg.evaluate(()=>{const r=[...document.querySelectorAll('[data-open-ship]')].find(x=>/DONE-1/.test(x.textContent||'')); (r||document.querySelector('[data-open-ship]')).click();});
   await pg.waitForTimeout(700);
 }
 ok(!!(await pg.$('#btnExportShipment')),'Export CSV button is present on a completed shipment');
 ok(!!(await pg.$('#btnExportPrintable')),'Print-ready button is present on a completed shipment');
 await pg.click('#btnExportShipment'); await pg.waitForTimeout(900);
 const csv=await pg.evaluate(()=>window.__saved[window.__saved.length-1].data);
 console.log('       --- first 14 lines of the CSV ---');
 csv.split('\n').slice(0,14).forEach((l,i)=>console.log('       '+String(i+1).padStart(2)+'| '+l));
 ok(/Invoice/.test(csv),'the word Invoice is in the export');
 ok(/CONTAINER:/.test(csv),'CONTAINER: label is in the export');
 ok(/PERMIT #:/.test(csv),'PERMIT #: label is in the export');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
})();

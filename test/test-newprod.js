const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'), fs=require('fs');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const EXACT='GOOD TIMES CIGARILLO 15 CT POUCH DISPLAY (45 CIGARS)- PRE-PRICED "3 CIGARS FOR $1.29"';
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

 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Test Co');
 await pg.type('#nsContainer','NEW-1',{delay:8});
 await pg.setInputFiles('#nsFile', path.resolve('needmaj-full.xlsx'));
 await pg.waitForTimeout(1500);
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1600);
 if(!(await pg.$('#scanInput'))){ await pg.click('[data-open-ship]'); await pg.waitForTimeout(600); }

 const before=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);

 // scan a barcode that is on neither the slip nor the catalogue
 await pg.click('#scanInput'); await pg.type('#scanInput','842426196949',{delay:8});
 await pg.press('#scanInput','Enter'); await pg.waitForTimeout(700);
 ok(!!(await pg.$('#enrollPanel')),'unknown barcode opens the enrollment panel');
 ok(!!(await pg.$('#btnEnrollNew')),'there is now an "Add as a new product" option');

 await pg.click('#btnEnrollNew'); await pg.waitForTimeout(500);
 ok(!!(await pg.$('#npDesc')),'the add-product form opens');
 const focused=await pg.evaluate(()=>document.activeElement&&document.activeElement.id);
 ok(focused==='npDesc','the description field is focused');
 await pg.fill('#npDesc', EXACT);
 await pg.fill('#npFlavor','SWEET');
 await pg.fill('#npSize','15 CT DISPLAY');
 await pg.click('#saveNewProd'); await pg.waitForTimeout(1000);

 const after=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);
 ok(after===before+1,'exactly one product was added to the master list ('+before+' -> '+after+')');
 const rec=await pg.evaluate(()=>{
   const r=[...document.querySelectorAll('#skuMaster .sku')].find(s=>(s.getAttribute('data-barcodes')||'').indexOf('842426196949')>-1);
   return r? {desc:r.getAttribute('data-desc'), flavor:r.getAttribute('data-flavor'), size:r.getAttribute('data-size'), codes:r.getAttribute('data-barcodes')}:null;
 });
 ok(rec!=null,'the new product carries the scanned barcode');
 ok(rec && rec.desc===EXACT,'the description is stored EXACTLY as typed');
 console.log('       stored: '+JSON.stringify(rec));
 ok(rec && rec.flavor==='SWEET' && rec.size==='15 CT DISPLAY','flavour and size saved');

 // the scan counted, and against a real line
 const scan=await pg.evaluate(()=>{
   const s=[...document.querySelectorAll('#shipments .shipment .scan')].pop();
   return s? {sku:s.getAttribute('data-sku'), res:s.getAttribute('data-result')}:null;
 });
 ok(scan && scan.res!=='unknown','the box counted instead of being logged as unknown: '+JSON.stringify(scan));
 const line=await pg.evaluate(()=>[...document.querySelectorAll('#shipments .shipment .line')]
   .some(l=>/GOOD TIMES CIGARILLO/.test(l.getAttribute('data-desc')||'')));
 ok(line,'it was added to the packing slip as a line');

 // scanning it again is now instant — no panel
 await pg.click('#scanInput'); await pg.type('#scanInput','842426196949',{delay:8});
 await pg.press('#scanInput','Enter'); await pg.waitForTimeout(700);
 ok(!(await pg.$('#enrollPanel')),'the second scan is recognised instantly, no panel');
 const cnt=await pg.evaluate(()=>[...document.querySelectorAll('#shipments .shipment .scan')]
   .filter(s=>s.getAttribute('data-void')!=='true').length);
 ok(cnt===2,'both boxes counted ('+cnt+')');

 // and it survives into the catalogue export word for word
 await pg.evaluate(()=>{const b=[...document.querySelectorAll('[data-nav="skus"]')].find(x=>x.offsetParent); if(b)b.click();});
 await pg.waitForTimeout(600);
 await pg.click('#btnExportSkus'); await pg.waitForTimeout(900);
 const csv=await pg.evaluate(()=>window.__saved[window.__saved.length-1].data);
 ok(csv.indexOf(EXACT)>-1 || csv.indexOf(EXACT.replace(/"/g,'""'))>-1,'the exact description appears in the catalogue export');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

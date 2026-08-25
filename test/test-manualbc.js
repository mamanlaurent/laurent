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
 await ctx.addInitScript(()=>{ window.claude={use:async()=>null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(600);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:15});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);

 // a slip import creates products with no barcode yet
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Goodtime');
 await pg.setInputFiles('#nsFile', path.resolve('slip5665.xlsx'));
 await pg.waitForTimeout(2500);
 await pg.click('#saveNewShip'); await pg.waitForTimeout(2000);

 await nav(pg,'skus');
 const warn=await pg.textContent('#app');
 ok(/no barcode yet/i.test(warn),'the Products page flags how many have no barcode');

 // the filter that finds them
 ok(!!(await pg.$('#skuOnlyMissing')),'there is a "Only products without a barcode" filter');
 await pg.check('#skuOnlyMissing'); await pg.waitForTimeout(600);
 const rows=await pg.$$eval('#skuResults tbody tr',rs=>rs.filter(r=>!r.querySelector('.empty')).length);
 ok(rows>=20,'the filter lists the ones missing a barcode ('+rows+')');
 const shown=await pg.textContent('#skuResults');
 ok(/learns on first scan/i.test(shown),'they read "— learns on first scan —"');

 // edit one and type the barcode in by hand, hyphens and all
 await pg.evaluate(()=>{
   const r=[...document.querySelectorAll('#skuMaster .sku')].find(s=>/Sweetwoods Cigars Vanilla/.test(s.getAttribute('data-desc')||''));
   document.querySelector('[data-edit-sku="'+r.getAttribute('data-rid')+'"]').click();
 });
 await pg.waitForTimeout(500);
 ok(!!(await pg.$('#skuBarcodes')),'Edit has a Barcode(s) field');
 await pg.fill('#skuBarcodes','8-42426-19694-9');
 await pg.click('#saveSkuModal'); await pg.waitForTimeout(900);

 const rec=await pg.evaluate(()=>{
   const r=[...document.querySelectorAll('#skuMaster .sku')].find(s=>/Sweetwoods Cigars Vanilla/.test(s.getAttribute('data-desc')||''));
   return {codes:r.getAttribute('data-barcodes'), sku:r.getAttribute('data-sku')};
 });
 ok(rec.codes==='842426196949','the hyphens are stripped on save: "'+rec.codes+'"');

 // once it has a barcode it correctly drops out of the "missing" filter
 const stillListed=await pg.evaluate(()=>/Sweetwoods Cigars Vanilla/.test(document.querySelector('#skuResults').textContent));
 ok(!stillListed,'it leaves the "no barcode" list as soon as one is entered');
 await pg.uncheck('#skuOnlyMissing'); await pg.waitForTimeout(600);

 // two barcodes on one product
 await pg.evaluate(()=>{
   const r=[...document.querySelectorAll('#skuMaster .sku')].find(s=>/Sweetwoods Cigars Vanilla/.test(s.getAttribute('data-desc')||''));
   document.querySelector('[data-edit-sku="'+r.getAttribute('data-rid')+'"]').click();
 });
 await pg.waitForTimeout(500);
 await pg.fill('#skuBarcodes','842426196949, 0123456789012');
 await pg.click('#saveSkuModal'); await pg.waitForTimeout(900);
 const two=await pg.evaluate(()=>{
   const r=[...document.querySelectorAll('#skuMaster .sku')].find(s=>/Sweetwoods Cigars Vanilla/.test(s.getAttribute('data-desc')||''));
   return r.getAttribute('data-barcodes');
 });
 ok(two==='842426196949,0123456789012','two barcodes on one product: "'+two+'"');

 // and it now scans against the slip line, no enrollment panel
 await nav(pg,'shipments');
 await pg.click('[data-open-ship]'); await pg.waitForTimeout(700);
 await pg.click('#scanInput'); await pg.type('#scanInput','842426196949',{delay:8});
 await pg.press('#scanInput','Enter'); await pg.waitForTimeout(800);
 ok(!(await pg.$('#enrollPanel')),'scanning it is instant — no "which item is this?" panel');
 const flash=await pg.textContent('.alert-flash').catch(()=>'');
 ok(/Vanilla/i.test(flash),'it names the right product: '+flash.trim().slice(0,80));
 const scan=await pg.evaluate(()=>{const s=[...document.querySelectorAll('#shipments .shipment .scan')].pop();
   return {res:s.getAttribute('data-result'), sku:s.getAttribute('data-sku')};});
 ok(scan.res==='ok','it counted against the packing-slip line: '+JSON.stringify(scan));

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(500);};
const SWEET='842426196949', GRAPE='842426196956';

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
 console.log('\n=== '+dev.name+' ===');
 const ctx=await b.newContext(dev);
 await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(500);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:20});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);

 // ---- import the master list (flavour + size in their own columns, hyphenated barcode)
 await nav(pg,'skus');
 await pg.setInputFiles('#skuImportFile', path.resolve('gt.csv'));
 await pg.waitForTimeout(1500);
 const recs=await pg.evaluate(()=>[...document.querySelectorAll('#skuMaster .sku')]
   .filter(s=>/GOOD TIMES/i.test(s.getAttribute('data-desc')||''))
   .map(s=>({sku:s.getAttribute('data-sku'),flavor:s.getAttribute('data-flavor'),
             size:s.getAttribute('data-size'),codes:s.getAttribute('data-barcodes')})));
 ok(recs.length===2,'the two flavours are two separate products (got '+recs.length+')');
 const sweet=recs.find(r=>/SWEET/i.test(r.flavor||''));
 ok(!!sweet,'SWEET is stored in its own field');
 ok(sweet && sweet.codes===SWEET,'the hyphenated barcode is stored as plain digits: '+(sweet&&sweet.codes));
 ok(recs.every(r=>/15 CT DISPLAY/i.test(r.size||'')),'the size column is kept');
 ok(recs[0].sku!==recs[1].sku,'the two flavours get different item codes');

 // flavour is visible in the products table and searchable
 const tbl=await pg.textContent('#skuResults');
 ok(/SWEET/.test(tbl)&&/GRAPE/.test(tbl),'both flavours show in the products table');
 await pg.click('#skuSearch'); await pg.type('#skuSearch','SWEET',{delay:40}); await pg.waitForTimeout(500);
 const filtered=await pg.textContent('#skuResults');
 ok(/SWEET/.test(filtered)&&!/GRAPE/.test(filtered),'searching a flavour finds just that one');
 await pg.fill('#skuSearch',''); await pg.waitForTimeout(300);

 // ---- receive a container whose slip has only the description
 await nav(pg,'shipments');
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.type('#nsClient','Good Times',{delay:10});
 await pg.type('#nsContainer','GT-TEST-1',{delay:10});
 await pg.setInputFiles('#nsFile', path.resolve('slip-gt.csv'));
 await pg.waitForTimeout(1200);
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1500);
 if(!(await pg.$('#scanInput'))){ await pg.click('[data-open-ship]'); await pg.waitForTimeout(600); }

 // ---- scan it exactly as a USB scanner sends it: plain digits, no hyphens
 await pg.click('#scanInput');
 await pg.type('#scanInput',SWEET,{delay:8});
 await pg.press('#scanInput','Enter');
 await pg.waitForTimeout(700);
 const flash=await pg.textContent('.alert-flash').catch(()=>'');
 console.log('       scan feedback: '+flash.trim());
 ok(!/UNKNOWN BARCODE/i.test(flash),'the hyphenated master-list barcode is recognised when scanned as digits');
 ok(/SWEET/i.test(flash),'the scan feedback names the SWEET flavour');
 ok(/GOOD TIMES CIGARILLO/i.test(flash),'the scan feedback shows the description');

 const scan=await pg.evaluate(()=>{
   const s=[...document.querySelectorAll('#shipments .shipment .scan')].pop();
   return s? {sku:s.getAttribute('data-sku'),prod:s.getAttribute('data-prodsku'),code:s.getAttribute('data-barcode'),res:s.getAttribute('data-result')}:null;
 });
 ok(scan && scan.res==='ok','it counted against the packing-slip line: '+JSON.stringify(scan));
 ok(scan && scan.prod===sweet.sku,'the scan records the SWEET product, not GRAPE (prod='+(scan&&scan.prod)+')');

 const audit=await pg.evaluate(()=>[...document.querySelectorAll('#auditLog .entry')]
   .filter(e=>e.getAttribute('data-action')==='scan').map(e=>e.getAttribute('data-detail')).pop());
 console.log('       audit: '+audit);
 ok(/SWEET/.test(audit||''),'the audit trail records the flavour');

 // ---- exports
 await pg.click('#btnExportShipment'); await pg.waitForTimeout(800);
 const ship=await pg.evaluate(()=>window.__saved[window.__saved.length-1].data);
 const hdr=ship.split('\n').find(l=>/Description/.test(l)&&/Scanned/.test(l));
 const line=ship.split('\n').find(l=>/GOOD TIMES CIGARILLO/.test(l)&&/MATCH|SHORT|OVER/.test(l));
 console.log('       shipment export header: '+hdr);
 console.log('       shipment export line:   '+line);
 ok(/Flavour/i.test(hdr||''),'the shipment export has a Flavour column');
 ok(/SWEET/.test(line||''),'the flavour is on the shipment export line');
 ok(new RegExp(SWEET).test(line||''),'the barcode is on the shipment export line');

 await nav(pg,'skus');
 await pg.click('#btnExportSkus'); await pg.waitForTimeout(800);
 const cat=await pg.evaluate(()=>window.__saved[window.__saved.length-1].data);
 console.log('       catalogue export header: '+cat.split('\n')[0]);
 ok(/Flavor|Flavour/i.test(cat.split('\n')[0]),'the catalogue export has a Flavor column');
 ok(cat.split('\n').some(l=>/SWEET/.test(l)&&/GOOD TIMES/.test(l)),'SWEET is on its own catalogue row');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

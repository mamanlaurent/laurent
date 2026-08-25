const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1400,height:900}});
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(400);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:20});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(300);
 await pg.type('#nsClient','Needmaj',{delay:10});
 await pg.setInputFiles('#nsFile', path.resolve('needmaj-totals.xlsx'));
 await pg.waitForTimeout(1500);
 const prev=await pg.$$eval('#nsPreview tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.trim())));
 const descs=prev.map(r=>r[1]);
 ok(prev.length===10,'footer totals block is not imported as products ('+prev.length+' lines, expected 10)');
 ok(!descs.some(d=>/^(Cigars Quantity|Wrappers Quantity|Net Weight|Gross Weight|TOTAL)$/i.test(d)),
    'no summary label became a product: '+JSON.stringify(descs.filter(d=>d.split(/\s+/).length<=4)));
 const total=prev.reduce((a,r)=>a+parseInt(r[2]||'0',10),0);
 ok(total===1256,'total still 1256 (got '+total+')');
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1500);
 const skus=await pg.$$eval('#skuMaster .sku',es=>es.map(e=>e.getAttribute('data-desc')));
 const junk=skus.filter(d=>/^(Cigars Quantity|Wrappers Quantity|Net Weight|Gross Weight|TOTAL)$/i.test(d||''));
 ok(junk.length===0,'no summary label is in the master catalogue ('+skus.length+' products, junk: '+JSON.stringify(junk)+')');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

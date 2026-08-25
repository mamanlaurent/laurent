const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(500);};
const D=/4 K's CIGARILLO/;
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
 await nav(pg,'skus');

 // --- reproduce the damaged state: one product carrying all 28 barcodes
 await pg.evaluate(()=>{
   const codes=["842426195140","842426195171","842426195201","842426195232","842426195263","842426195294",
   "842426195324","842426195355","842426195386","842426195416","842426195447","842426195478",
   "842426195508","842426195539","842426195560","842426195591","842426195621","842426195652",
   "842426195683","842426195713","842426195744","842426195775","842426195805","842426195836",
   "842426195867","842426195898","842426195928","842426195959"];
   const d=document.createElement('div'); d.className='sku';
   d.setAttribute('data-rid','merged-one'); d.setAttribute('data-sku','ITM-MERGED');
   d.setAttribute('data-desc','4 K\'s CIGARILLO 15 CT POUCH DISPLAY (60 CIGARS) PRE-PRICED "4 CIGARS FOR $1.59"');
   d.setAttribute('data-barcodes', codes.join(',')); d.setAttribute('data-active','true');
   document.querySelector('#skuMaster').appendChild(d);
 });
 await pg.waitForTimeout(200);
 const merged=await pg.evaluate(()=>{
   const r=document.querySelector('.sku[data-rid="merged-one"]');
   return (r.getAttribute('data-barcodes')||'').split(',').filter(Boolean).length;
 });
 ok(merged===28,'starting from the damaged record: one product, '+merged+' barcodes');

 // --- re-import the master list
 await pg.setInputFiles('#skuImportFile', path.resolve('4k.csv'));
 await pg.waitForTimeout(3000);

 const after=await pg.evaluate(()=>[...document.querySelectorAll('#skuMaster .sku')]
   .filter(s=>/4 K's CIGARILLO/.test(s.getAttribute('data-desc')||''))
   .map(s=>({sku:s.getAttribute('data-sku'),flavor:s.getAttribute('data-flavor'),
             n:(s.getAttribute('data-barcodes')||'').split(',').filter(Boolean).length,
             codes:s.getAttribute('data-barcodes')})));
 ok(after.length===28,'the merged product is split into 28 separate products (got '+after.length+')');
 ok(after.every(r=>r.n===1),'each product holds exactly one barcode (max '+Math.max(...after.map(r=>r.n))+')');
 const flavours=after.map(r=>r.flavor).filter(Boolean);
 ok(new Set(flavours).size===28,'all 28 flavours are distinct ('+new Set(flavours).size+')');
 const skus=after.map(r=>r.sku);
 ok(new Set(skus).size===28,'all 28 item codes are unique ('+new Set(skus).size+')');
 const allCodes=after.map(r=>r.codes);
 ok(new Set(allCodes).size===28,'no barcode is on two products');

 // --- each barcode resolves to its own flavour
 const probe=await pg.evaluate(()=>{
   const want={'842426195140':'SWEET','842426195263':'NATURAL','842426195959':'PALMA'};
   const out={};
   for(const code of Object.keys(want)){
     const rec=[...document.querySelectorAll('#skuMaster .sku')].find(s=>
       (s.getAttribute('data-barcodes')||'').split(',').indexOf(code)>-1);
     out[code]={got:rec?rec.getAttribute('data-flavor'):null, want:want[code]};
   }
   return out;
 });
 Object.keys(probe).forEach(c=>ok(probe[c].got===probe[c].want, c+' -> '+probe[c].want+' (got '+probe[c].got+')'));

 // --- re-importing the same file again must be a no-op, not a duplicator
 await pg.setInputFiles('#skuImportFile', path.resolve('4k.csv'));
 await pg.waitForTimeout(3000);
 const twice=await pg.evaluate(()=>[...document.querySelectorAll('#skuMaster .sku')]
   .filter(s=>/4 K's CIGARILLO/.test(s.getAttribute('data-desc')||'')).length);
 ok(twice===28,'re-importing the same file does not duplicate anything (still '+twice+')');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

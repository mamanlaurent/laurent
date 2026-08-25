const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'), fs=require('fs');
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
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(500);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:20});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);

 await nav(pg,'skus');
 // import a master list that carries barcodes
 await pg.setInputFiles('#skuImportFile', path.resolve('skulist.csv'));
 await pg.waitForTimeout(1500);
 const withCodes=()=>pg.evaluate(()=>[...document.querySelectorAll('#skuMaster .sku')]
   .filter(s=>(s.getAttribute('data-barcodes')||'').trim()).length);
 const before=await withCodes();
 ok(before>=4,'imported products carry their barcodes ('+before+' with codes)');

 // export the catalogue
 await pg.click('#btnExportSkus'); await pg.waitForTimeout(800);
 const csv=await pg.evaluate(()=>window.__saved.length?window.__saved[window.__saved.length-1].data:null);
 ok(csv!=null,'Export CSV produced a file');
 ok(/Barcodes/i.test(csv.split('\n')[0]),'export has a Barcodes column: '+csv.split('\n')[0]);
 ok(/012345678905/.test(csv),'export contains the actual barcodes');
 const tmp=path.resolve('roundtrip-export.csv'); fs.writeFileSync(tmp,csv);

 // the confirmation now says what it wants
 await pg.click('#btnDeleteAllSkus'); await pg.waitForTimeout(400);
 const btnTxt=await pg.textContent('#doConfirmDel');
 ok(/Type DELETE ALL to confirm/.test(btnTxt),'disabled button states the required word: "'+btnTxt.trim()+'"');
 const focused=await pg.evaluate(()=>document.activeElement && document.activeElement.id);
 ok(focused==='confirmDelWord','the confirmation field is focused automatically (focus was on "'+focused+'")');
 await pg.type('#confirmDelWord','DELETE ALL',{delay:30}); await pg.waitForTimeout(250);
 ok(/Delete permanently/.test(await pg.textContent('#doConfirmDel')),'button flips to "Delete permanently" once the word matches');
 await pg.click('#doConfirmDel'); await pg.waitForTimeout(900);
 ok(await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length)===0,'catalogue emptied');

 // restore from the exported file
 await nav(pg,'skus');
 await pg.setInputFiles('#skuImportFile', tmp);
 await pg.waitForTimeout(1500);
 const after=await withCodes();
 const total=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);
 ok(after===before,'re-importing the export restores every barcode ('+before+' -> '+after+')');
 const codes=await pg.evaluate(()=>[...document.querySelectorAll('#skuMaster .sku')]
   .map(s=>s.getAttribute('data-barcodes')).filter(Boolean).sort());
 ok(codes.some(c=>/012345678905/.test(c)),'a specific barcode came back: '+JSON.stringify(codes.slice(0,3)));
 console.log('       restored '+total+' products, '+after+' with barcodes');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

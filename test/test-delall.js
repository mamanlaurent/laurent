const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,tab)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},tab); await pg.waitForTimeout(500);};

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
 console.log('\n=== '+dev.name+' ===');
 const ctx=await b.newContext(dev);
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(500);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:20});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);

 await nav(pg,'skus');
 const before=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);
 ok(before>0,'catalogue has products to start ('+before+')');
 ok(!!(await pg.$('#btnDeleteAllSkus')),'delete-all button is present');
 ok(/Delete all/.test(await pg.textContent('#btnDeleteAllSkus')),'button reads "Delete all" with no search active');

 // --- scoped delete: search first
 await pg.click('#skuSearch');
 await pg.type('#skuSearch','Case of 6',{delay:50});
 await pg.waitForTimeout(500);
 ok(await pg.inputValue('#skuSearch')==='Case of 6','search keeps typed text');
 const shown=await pg.$$eval('#skuResults tbody tr',rs=>rs.filter(r=>!r.querySelector('.empty')).length);
 const label=await pg.textContent('#btnDeleteAllSkus');
 ok(/Delete these/.test(label),'button switches to "Delete these" when filtered: "'+label.trim()+'"');
 ok(label.indexOf(String(shown))>-1,'button count matches the rows shown ('+shown+')');

 await pg.click('#btnDeleteAllSkus'); await pg.waitForTimeout(400);
 ok(!!(await pg.$('#confirmDelBack')),'confirmation modal opens');
 ok(await pg.isDisabled('#doConfirmDel'),'delete is blocked until the word is typed');
 await pg.type('#confirmDelWord','WRONG',{delay:20}); await pg.waitForTimeout(200);
 ok(await pg.isDisabled('#doConfirmDel'),'the wrong word does not unlock it');
 await pg.fill('#confirmDelWord','delete'); await pg.waitForTimeout(200);
 ok(!(await pg.isDisabled('#doConfirmDel')),'the right word unlocks it (case-insensitive)');
 await pg.click('#doConfirmDel'); await pg.waitForTimeout(800);
 const afterScoped=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);
 ok(afterScoped===before-shown,'only the matching products went ('+before+' -> '+afterScoped+', removed '+shown+')');
 const leftover=await pg.evaluate(()=>[...document.querySelectorAll('#skuMaster .sku')].some(s=>/Case of 6/i.test(s.getAttribute('data-desc')||'')));
 ok(!leftover,'no matching product survived');

 // shipments must be untouched
 const ships=await pg.evaluate(()=>({s:document.querySelectorAll('#shipments .shipment').length,
                                     l:document.querySelectorAll('#shipments .line').length}));
 ok(ships.s===0 && ships.l===0,'no shipments existed to disturb: '+JSON.stringify(ships));

 // --- full delete
 await nav(pg,'skus');
 await pg.fill('#skuSearch',''); await pg.waitForTimeout(400);
 await nav(pg,'shipments'); await nav(pg,'skus');   // force a full re-render of the header
 const mid=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);
 ok(/Delete all/.test(await pg.textContent('#btnDeleteAllSkus')),'button reads "Delete all" again once the search is cleared');
 await pg.click('#btnDeleteAllSkus'); await pg.waitForTimeout(400);
 const bodyTxt=await pg.textContent('#confirmDelBack');
 ok(/DELETE ALL/.test(bodyTxt),'the full wipe demands the longer confirmation word');
 await pg.fill('#confirmDelWord','DELETE'); await pg.waitForTimeout(200);
 ok(await pg.isDisabled('#doConfirmDel'),'plain DELETE is not enough for a full wipe');
 await pg.fill('#confirmDelWord','DELETE ALL'); await pg.waitForTimeout(200);
 await pg.click('#doConfirmDel'); await pg.waitForTimeout(900);
 const after=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);
 ok(after===0,'catalogue is empty ('+mid+' -> '+after+')');
 ok(!(await pg.$('#btnDeleteAllSkus')),'the button disappears when there is nothing left to delete');
 const emptyTxt=await pg.textContent('#skuResults');
 ok(/No products/i.test(emptyTxt),'empty state shown');

 // audit + persistence
 const audit=await pg.evaluate(()=>[...document.querySelectorAll('#auditLog .entry')]
   .filter(e=>e.getAttribute('data-action')==='delete-skus').map(e=>e.getAttribute('data-detail')));
 ok(audit.length===2,'both deletions are in the audit trail');
 audit.forEach(a=>console.log('       audit: '+a));
 await pg.waitForTimeout(700);
 await pg.reload(); await pg.waitForTimeout(1000);
 const afterReload=await pg.evaluate(()=>({sk:document.querySelectorAll('#skuMaster .sku').length,
                                           sh:document.querySelectorAll('#shipments .shipment').length}));
 ok(afterReload.sk===0 && afterReload.sh===0,'deletion survives a reload, shipments intact: '+JSON.stringify(afterReload));

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

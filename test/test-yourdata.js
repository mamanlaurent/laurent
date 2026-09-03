const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
 console.log('\n=== '+dev.name+' ===');
 const ctx=await b.newContext(dev);
 await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped.html')); await pg.waitForTimeout(1000);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:20});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(800);
 const n=await pg.evaluate(()=>document.querySelectorAll('#skuMaster .sku').length);
 ok(n>=402,'your real catalogue is intact ('+n+' products)');
 const fl=await pg.evaluate(()=>[...document.querySelectorAll('#skuMaster .sku')].filter(s=>s.getAttribute('data-flavor')).length);
 ok(fl>370,'flavours intact ('+fl+')');

 await pg.evaluate(()=>{const b=[...document.querySelectorAll('[data-nav="shipments"]')].find(x=>x.offsetParent); if(b)b.click();});
 await pg.waitForTimeout(600);
 await pg.click('[data-open-ship]'); await pg.waitForTimeout(800);
 await pg.click('#btnExportPrintable'); await pg.waitForTimeout(1000);
 const h=await pg.evaluate(()=>window.__saved[window.__saved.length-1].data);
 ok(/NEEDMAJ/.test(h),'letterhead shows NEEDMAJ, not the client');
 const sub=await pg.evaluate(()=>document.querySelector('#settings').getAttribute('data-companysub')||'');
 ok(!sub || h.indexOf(sub)>-1,'your letterhead second line prints as you typed it: "'+sub+'"');
 // read the real client off the shipment rather than hardcoding a name that can be edited
 const info=await pg.evaluate(()=>{
   const sh=document.querySelector('#shipments .shipment');
   const name=sh.getAttribute('data-client')||'';
   const c=[...document.querySelectorAll('#clients .client')].find(x=>x.getAttribute('data-name')===name);
   return {name:name, cust:(c&&c.getAttribute('data-custid'))||''};
 });
 ok(info.name && h.indexOf(info.name)>-1,'the client "'+info.name+'" appears under Ship To');
 ok(!info.cust || h.indexOf(info.cust)>-1,'their Customer ID carries through ("'+info.cust+'")');
 const cats=await pg.evaluate(()=>document.querySelectorAll('#priceList .pcat').length);
 console.log('       price-list categories loaded: '+cats);
 require('fs').writeFileSync('yours-preview.html',h);
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
})();

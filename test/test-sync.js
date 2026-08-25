const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(500);};
const login=async pg=>{ if(!(await pg.$('#loginForm'))) return;   // the session may still be open after a reload
  await pg.selectOption('#loginName',{index:0});
  await pg.type('#loginPin','1234',{delay:15}); await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(600); };
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1400,height:900}});
 await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(600);
 await login(pg);

 // this device makes a change -> its local copy is now newer than the page it was served
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Phone Only Co');
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1500);
 await pg.waitForTimeout(700);
 await pg.reload(); await pg.waitForTimeout(1000);
 await login(pg);

 await nav(pg,'users');
 const txt=await pg.textContent('#app');
 ok(/showing.*its own copy/i.test(txt),'the app says plainly that this device is on its own copy');
 ok(/Save to cloud/.test(txt),'it says other devices will not see it until Save to cloud');
 ok(!!(await pg.$('#btnUseCloud')),'there is a way back to the cloud copy');

 const before=await pg.evaluate(()=>document.querySelectorAll('#shipments .shipment').length);
 ok(before===1,'the local-only shipment is present ('+before+')');

 await pg.click('#btnUseCloud'); await pg.waitForTimeout(500);
 ok(!!(await pg.$('#confirmDelWord')),'it confirms before discarding local work');
 const btn=await pg.textContent('#doConfirmDel');
 ok(/Type REPLACE to confirm/.test(btn),'the button states the word: "'+btn.trim()+'"');
 await pg.fill('#confirmDelWord','REPLACE'); await pg.waitForTimeout(250);
 await pg.click('#doConfirmDel'); await pg.waitForTimeout(1000);

 const after=await pg.evaluate(()=>document.querySelectorAll('#shipments .shipment').length);
 ok(after===0,'the cloud copy is now on screen ('+after+' shipments)');
 const cleared=await pg.evaluate(()=>{ try{ return localStorage.getItem('dockside_db_v2')===null; }catch(e){ return 'err'; } });
 ok(cleared===true || cleared===false,'localStorage handled without throwing');
 const logged=await pg.evaluate(()=>[...document.querySelectorAll('#auditLog .entry')]
   .some(e=>e.getAttribute('data-action')==='use-cloud-copy'));
 ok(logged,'switching copies is recorded in the audit trail');

 // and the banner is gone
 await nav(pg,'users');
 ok(!/showing.*its own copy/i.test(await pg.textContent('#app')),'the banner clears once back on the cloud copy');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

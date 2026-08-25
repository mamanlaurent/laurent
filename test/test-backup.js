const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'), fs=require('fs');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(500);};
const census=pg=>pg.evaluate(()=>({
  clients:document.querySelectorAll('#clients .client').length,
  shipments:document.querySelectorAll('#shipments .shipment').length,
  lines:document.querySelectorAll('#shipments .line').length,
  scans:document.querySelectorAll('#shipments .scan').length,
  skus:document.querySelectorAll('#skuMaster .sku').length,
  audit:document.querySelectorAll('#auditLog .entry').length,
  users:document.querySelectorAll('#roster .employee').length
}));
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

 // build some real data
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Backup Test Co');
 await pg.type('#nsContainer','BKP-1',{delay:8});
 await pg.setInputFiles('#nsFile', path.resolve('needmaj-full.xlsx'));
 await pg.waitForTimeout(1500);
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1600);
 const before=await census(pg);
 console.log('       before: '+JSON.stringify(before));
 ok(before.shipments>=1 && before.lines>=10,'data created');

 // export a backup
 await nav(pg,'users');
 await pg.click('#btnExportBackup'); await pg.waitForTimeout(900);
 const bk=await pg.evaluate(()=>window.__saved[window.__saved.length-1]);
 ok(/\.json$/.test(bk.filename),'backup file is JSON: '+bk.filename);
 const parsed=JSON.parse(bk.data);
 ok(parsed.app==='dockside-receiving' && typeof parsed.db==='string','backup has the whole database');
 ok(/BKP-1/.test(parsed.db),'the shipment is inside the backup');
 ok(/auditLog/.test(parsed.db),'the audit trail is inside the backup');
 const f=path.resolve('bk.json'); fs.writeFileSync(f, bk.data);
 console.log('       backup size: '+(bk.data.length/1024).toFixed(1)+' KB');

 // wipe, then restore
 await pg.evaluate(()=>{
   ['#clients','#shipments','#skuMaster','#auditLog'].forEach(s=>{document.querySelector(s).innerHTML='';});
 });
 await pg.waitForTimeout(200);
 const wiped=await census(pg);
 ok(wiped.shipments===0,'wiped to nothing');

 await pg.setInputFiles('#restoreFile', f);
 await pg.waitForTimeout(700);
 ok(!!(await pg.$('#confirmDelWord')),'restore asks for confirmation before replacing anything');
 const btnTxt=await pg.textContent('#doConfirmDel');
 ok(/Type RESTORE to confirm/.test(btnTxt),'the button says what to type: "'+btnTxt.trim()+'"');
 await pg.fill('#confirmDelWord','RESTORE'); await pg.waitForTimeout(250);
 await pg.click('#doConfirmDel');
 await pg.waitForTimeout(1800);
 const after=await census(pg);
 console.log('       after restore: '+JSON.stringify(after));
 const same=Object.keys(before).every(k=>k==='audit'? after[k]===before[k]+1 : after[k]===before[k]);
 ok(same,'restore brings back everything, exactly (audit +1 for the restore itself)');
 const logged=await pg.evaluate(()=>[...document.querySelectorAll('#auditLog .entry')]
   .some(e=>e.getAttribute('data-action')==='restore-backup'));
 ok(logged,'the restore is recorded in the audit trail');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(600);};
const EXPECT5734=[286,367,56,167,25,180,482,5,85];
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1500,height:950}});
 await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(600);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:15});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(600);

 await nav(pg,'pricelist');
 await pg.setInputFiles('#plFile', path.resolve('spec/pricelist.xlsx'));
 await pg.waitForTimeout(2500);

 await nav(pg,'shipments');
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Good Times USA LLC');
 await pg.setInputFiles('#nsFile', path.resolve('spec/psl5734.xlsx'));
 await pg.waitForTimeout(2500);
 ok(await pg.inputValue('#nsContainer')==='TEMU-639444-2','container copied from the importer slip');
 ok(await pg.inputValue('#nsPO')==='81826','PO copied');
 const cust=await pg.inputValue('#nsCustId');
 ok(/^JK-5734$/.test(cust),'Customer ID built as <consignee>-<importer no>: '+cust);
 await pg.click('#saveNewShip'); await pg.waitForTimeout(2500);
 if(!(await pg.$('.d-breakdown'))){ await pg.click('[data-open-ship]'); await pg.waitForTimeout(800); }

 const rows=await pg.$$eval('.d-breakdown tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.trim())));
 const body=rows.filter(r=>r[0]!=='TOTAL');
 console.log('  %-52s %6s %5s %7s %6s %9s %9s %9s'.replace(/%-52s/,'category'.padEnd(52)));
 body.forEach(r=>console.log('  '+r[0].split('\n')[0].slice(0,50).padEnd(52)+r[1].padStart(6)+String(r[2]||'').padStart(6)+r[3].padStart(8)+r[4].padStart(7)+String(r[5]||'').padStart(10)+String(r[6]||'').padStart(10)+String(r[7]||'').padStart(10)));
 ok(body.length===9,'nine categories (got '+body.length+')');
 const got=body.map(r=>parseInt(r[1],10)).sort((a,b)=>a-b);
 ok(JSON.stringify(got)===JSON.stringify([...EXPECT5734].sort((a,b)=>a-b)),
    'category quantities match the importer invoice: '+got.join(','));
 const txt=await pg.textContent('.d-breakdown');
 ok(/ALL<\/strong> rate|ALL\b/.test(txt),'JK shipment prices at the ALL rate, not HA');
 ok(/Tab 3 total/.test(txt)&&/Tab 4 total/.test(txt)&&/Margin/.test(txt),'tab totals and margin shown');

 // fees entered on the second visit
 await pg.evaluate(()=>{
   const i=document.querySelector('[data-feeset="cust"][data-fee="shipping"]');
   i.value='4444'; i.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await pg.waitForTimeout(800);
 const after=await pg.textContent('.d-breakdown');
 ok(/4444/.test(after)||/4,444/.test(after),'a fee typed in flows into the tab 4 total');

 // the four sheets
 await pg.click('#btnExportTabs'); await pg.waitForTimeout(1600);
 const saved=await pg.evaluate(()=>window.__saved.map(s=>s.filename));
 console.log('       files: '+saved.join('  '));
 ok(saved.length===4,'four sheets exported (got '+saved.length+')');
 const all=await pg.evaluate(()=>window.__saved.map(s=>s.data));
 ok(all.every(d=>/NEEDMAJ/.test(d)),'every sheet carries the NEEDMAJ letterhead');
 ok(all.every(d=>/TEMU-639444-2/.test(d)),'every sheet carries the container');
 ok(all.every(d=>/JK-5734/.test(d)),'every sheet carries the Customer ID');
 ok(/Quantity of Master Cases/.test(all[0])&&/Net Weight Per Case/.test(all[0]),'tab 1 is the packing slip');
 ok(/Number of pallets/.test(all[1])&&/Extra/.test(all[1]),'tab 2 is the pallet breakdown');
 ok(/Unit Price/.test(all[2])&&/SUB TOTAL/.test(all[2]),'tab 3 is the cost invoice');
 ok(/Delivered to Door/.test(all[3])&&/GRAND TOTAL/.test(all[3]),'tab 4 is the customer invoice');
 const t2=all[1].replace(/<[^>]+>/g,'|');
 ok(/\|367\|/.test(t2)&&/\|92\|/.test(t2),'tab 2 shows the group total beside the per-flavour cases');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 require('fs').writeFileSync('tab2-sample.html', all[1]);
 require('fs').writeFileSync('tab4-sample.html', all[3]);
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
})();

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(600);};
// the nine categories the importer's invoice bills, and their cases
const EXPECT=[['GT Cigarillos Mini',232],['HD Cigarillos',20],["4 K's",14],['5Pk',2],
              ['Dark',525],['2/1.49',98],['2/1.69',285],['California',2],['Pallets Containing',1]];
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
 console.log('\n=== '+dev.name+' ===');
 const ctx=await b.newContext(dev);
 await ctx.addInitScript(()=>{ window.__saved=[]; window.claude={use:async n=>n==='downloads'?{save:async r=>{window.__saved.push(r);return{status:'saved'};}}:null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(600);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:15});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(600);

 // ---- 1. load the price list
 await nav(pg,'pricelist');
 ok(!!(await pg.$('#plFile')),'Price List tab exists with a loader');
 await pg.setInputFiles('#plFile', path.resolve('spec/pricelist.xlsx'));
 await pg.waitForTimeout(2500);
 const cats=await pg.evaluate(()=>document.querySelectorAll('#priceList .pcat').length);
 ok(cats>=90,'price list loaded ('+cats+' categories)');
 const rates=await pg.evaluate(()=>({ha:document.querySelector('#settings').getAttribute('data-harate'),
                                     all:document.querySelector('#settings').getAttribute('data-allrate')}));
 ok(rates.ha==='0.022' && rates.all==='0.02','HA and ALL rates read from the sheet: '+JSON.stringify(rates));
 const plTxt=await pg.textContent('#app');
 ok(/HA \+2\.2%/.test(plTxt)&&/ALL \+2\.0%/.test(plTxt),'the rates are shown');

 // ---- 2. import the importer's packing slip
 await nav(pg,'shipments');
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Good Times USA LLC');
 await pg.setInputFiles('#nsFile', path.resolve('spec/psl5737.xlsx'));
 await pg.waitForTimeout(2500);
 const prev=await pg.$$eval('#nsPreview tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.trim())));
 const total=prev.reduce((a,r)=>a+parseInt(r[2]||'0',10),0);
 ok(total===1179,'slip total = 1,179 cases (got '+total+')');
 ok(await pg.inputValue('#nsContainer')==='SEGU-522984-8','container read from the importer slip');
 ok(await pg.inputValue('#nsPO')==='81826','P.O. number read from the importer slip');
 await pg.click('#saveNewShip'); await pg.waitForTimeout(2500);
 if(!(await pg.$('#scanInput'))){ await pg.click('[data-open-ship]'); await pg.waitForTimeout(700); }

 // ---- 3. the breakdown
 ok(!!(await pg.$('.d-breakdown')),'the breakdown panel appears');
 const rows=await pg.$$eval('.d-breakdown tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.trim())));
 const body=rows.filter(r=>r[0]!=='TOTAL');
 console.log('       %-58s %6s %6s %8s %5s %6s'.replace(/%-58s/,'category'.padEnd(58)).replace('%6s','cases').replace('%6s','#/PLT').replace('%8s','pallets').replace('%5s','full').replace('%6s','loose'));
 body.forEach(r=>console.log('       '+r[0].split('\n')[0].slice(0,56).padEnd(58)+r[1].padStart(6)+String(r[2]||'').padStart(7)+r[3].padStart(9)+r[4].padStart(6)+r[5].padStart(7)));
 ok(body.length===9,'nine categories (got '+body.length+')');
 let wrong=[];
 EXPECT.forEach(([frag,qty])=>{
   const r=body.find(x=>x[0].indexOf(frag)>-1);
   if(!r || parseInt(r[1],10)!==qty) wrong.push(frag+' expected '+qty+' got '+(r?r[1]:'missing'));
 });
 ok(wrong.length===0,'every category quantity matches the importer invoice'+(wrong.length?': '+wrong.join('; '):''));
 const totRow=rows.find(r=>r[0]==='TOTAL');
 ok(totRow && totRow[1]==='1179','breakdown totals 1,179 cases');
 ok(/not on the price list/.test(await pg.textContent('.d-breakdown')),'the packaging line is flagged, not silently grouped');

 // ---- 4. override boxes-per-pallet, exactly as the operator did
 const setPlt=async(frag,val)=>{
   await pg.evaluate(([f,v])=>{
     const rows=[...document.querySelectorAll('.d-breakdown tbody tr')];
     const r=rows.find(x=>x.textContent.indexOf(f)>-1);
     const i=r&&r.querySelector('[data-plt-key]');
     if(i){ i.value=v; i.dispatchEvent(new Event('change',{bubbles:true})); }
   },[frag,val]);
   await pg.waitForTimeout(700);
 };
 await setPlt('GT Cigarillos Mini','63');
 await setPlt('2/1.49','44'); await setPlt('2/1.69','44'); await setPlt('California','44');
 const after=await pg.$$eval('.d-breakdown tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.trim())));
 const tot2=after.find(r=>r[0]==='TOTAL');
 ok(tot2 && tot2[3]==='25.15','total pallets 25.15 — the workbook says 25.1513949 (got '+(tot2&&tot2[3])+')');
 const gt=after.find(r=>r[0].indexOf('GT Cigarillos Mini')>-1);
 ok(gt && gt[3]==='3.68' && gt[4]==='43','GT Mini: 3.68 pallets, 43 loose — matches the workbook');
 const dark=after.find(r=>r[0].indexOf('Dark')>-1);
 ok(dark && dark[3]==='11.93' && dark[4]==='41','Dark: 11.93 pallets, 41 loose — matches the workbook');
 ok(/#\/PLT was 48/.test(await pg.textContent('.d-breakdown')),'an override is labelled against the price list value');

 // ---- 5. export
 await pg.click('#btnExportTabs'); await pg.waitForTimeout(1600);
 const csv=await pg.evaluate(()=>window.__saved[1].data);
 ok(/Quantity of Master Cases/.test(csv),'export carries the slip column headings');
 ok(/SEGU-522984-8/.test(csv),'export carries the container');
 const dl=csv.replace(/<\/tr>/g,'\n').split('\n').find(l=>/Dark Sweet/.test(l));
 console.log('       export line: '+dl);
 ok(/525/.test(dl||'')&&/162/.test(dl||''),'the group total sits beside the per-line cases');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

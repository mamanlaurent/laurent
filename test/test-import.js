const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
const FILE='file://'+path.resolve('wrapped-seed.html');

const EXPECT={
 'Sweetwoods Cigars Vanilla':173,'Sweetwoods Cigars Cognac':89,'Sweetwoods Cigars Natural':140,
 'Banana Leaf Wraps':133,'Casino Cigarillos Blue':47,'Soul Cigarillos Berry':48,
 'Smooth Cigarillos Menthol':11,'Palma Cigarillos Grape':250,'Palma Cigarillos Mango':200,
 'King Leaf Wraps Original':165};

let fails=[];
function ok(c,msg){ console.log((c?'  ok  ':'  FAIL')+'  '+msg); if(!c) fails.push(msg); }

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
  console.log('\n=== '+dev.name+' ===');
  const ctx=await b.newContext({viewport:dev.viewport,isMobile:dev.isMobile,hasTouch:dev.hasTouch,userAgent:dev.userAgent});
  await ctx.addInitScript(()=>{
    window.__saved=[];
    window.claude={ use:async(n)=> n==='downloads'
      ? { save:async(req)=>{ window.__saved.push(req); return {status:'saved'}; } }
      : null };
  });
  const pg=await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(FILE); await pg.waitForTimeout(400);

  // login
  await pg.waitForSelector('#loginForm');
  await pg.selectOption('#loginName',{index:0});
  await pg.type('#loginPin','1234',{delay:20});
  await pg.click('#loginForm button[type=submit]');
  await pg.waitForTimeout(500);
  ok(!!(await pg.$('#btnNewShipment')),'logged in, shipments view shown');

  await pg.click('#btnNewShipment');
  await pg.waitForTimeout(400);

  await pg.type('#nsClient','Needmaj',{delay:15});
  await pg.type('#nsContainer','MSKU7734120',{delay:10});
  await pg.setInputFiles('#nsFile', path.resolve('needmaj-full.xlsx'));
  await pg.waitForTimeout(1500);

  // ignored-columns note
  const note=await pg.textContent('#nsMapper').catch(()=>'');
  ok(/Left out of this shipment/.test(note),'mapper shows ignored-columns note');
  ok(/Units Quantity/.test(note)&&/Net Weight/.test(note)&&/Gross Weight/.test(note),'note names all three columns');

  // quantity dropdown must not offer them
  const qtyOpts=await pg.$$eval('#mapQty option',o=>o.map(x=>x.textContent));
  ok(!qtyOpts.some(t=>/Units Quantity|Net Weight|Gross Weight/i.test(t)),'Quantity dropdown excludes the three columns');

  // preview totals
  const prev=await pg.$$eval('#nsPreview tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.trim())));
  const total=prev.reduce((a,r)=>a+parseInt(r[2]||'0',10),0);
  ok(total===1256,'total expected = 1256 (got '+total+')');
  for(const k of Object.keys(EXPECT)){
   const row=prev.find(r=>r[1].indexOf(k)===0);
   ok(row&&parseInt(row[2],10)===EXPECT[k],k+' = '+EXPECT[k]+' (got '+(row?row[2]:'missing')+')');
  }

  // create
  await pg.click('#saveNewShip');
  await pg.waitForTimeout(1500);
  const pallets=await pg.evaluate(()=>{ const s=document.querySelector('#shipments .shipment[data-container="MSKU7734120"]'); return s&&s.getAttribute('data-pallets'); });
  ok(pallets==='28','pallets pre-filled from slip = 28 (got '+pallets+')');
  const pnotes=await pg.evaluate(()=>{ const s=document.querySelector('#shipments .shipment[data-container="MSKU7734120"]'); return s&&s.getAttribute('data-palletnotes'); });
  ok(/loose boxes/.test(pnotes||''),'pallet notes mention loose boxes: '+pnotes);

  // stored header/raw must be free of the three columns
  const stored=await pg.evaluate(()=>{
   const s=document.querySelector('#shipments .shipment[data-container="MSKU7734120"]');
   return {hdr:JSON.parse(s.getAttribute('data-srcheaders')||'[]'),
           raw:JSON.parse((s.querySelector('.line')||{getAttribute:()=>null}).getAttribute('data-raw')||'[]')};
  });
  ok(!stored.hdr.some(h=>/Units Quantity|Net Weight|Gross Weight/i.test(h)),'stored headers exclude the three columns: '+JSON.stringify(stored.hdr));
  ok(!stored.raw.some(c=>/^311400$/.test(String(c).trim())),'stored row drops the units figure: '+JSON.stringify(stored.raw));
  ok(stored.hdr.length===stored.raw.length,'header and row widths match ('+stored.hdr.length+'/'+stored.raw.length+')');

  // export CSV content — open the shipment and press Export
  if(!(await pg.$('#btnExportShipment'))){
    await pg.evaluate(()=>{const r=[...document.querySelectorAll('[data-open-ship]')].find(x=>/MSKU7734120/.test(x.textContent||'')); (r||document.querySelector('[data-open-ship]')).click();});
    await pg.waitForTimeout(500);
  }
  await pg.click('#btnExportShipment');
  await pg.waitForTimeout(700);
  const csv=await pg.evaluate(()=>window.__saved.length? window.__saved[0].data : null);
  ok(csv!=null,'export produced a CSV');
  if(csv!=null){
   ok(!/Units Quantity|Net Weight|Gross Weight/i.test(csv),'export CSV excludes the three columns');
   ok(!/311400|191520/.test(csv),'export CSV has no unit totals');
   // no CELL is a bare weight figure (12.25 inside a description is the product name, fine)
   const bareWeight=csv.split('\n').some(l=>l.replace(/"[^"]*"/g,'\u0000').split(',').some(c=>/^(12\.25|13\.4|11\.8|12\.9|10\.5|11\.6|9\.75|10\.8)$/.test(c.trim())));
   ok(!bareWeight,'no exported cell is a weight figure');
   ok(/Quantity of Master Cases/.test(csv)&&/Number of pallets/.test(csv)&&/Extra/.test(csv),'export CSV keeps the slip\'s real columns');
   ok(/TOTAL EXPECTED,1256/.test(csv),'export CSV total expected = 1256');
   const hdrLine=csv.split('\n').find(l=>/Quantity of Master Cases/.test(l));
   console.log('       header row: '+hdrLine);
   const firstLine=csv.split('\n').find(l=>/Sweetwoods Cigars Vanilla/.test(l));
   console.log('       first line: '+firstLine);
  }

  ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
  await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - ') : 'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'), fs=require('fs');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
const nav=async(pg,t)=>{await pg.evaluate(t=>{const b=[...document.querySelectorAll('[data-nav="'+t+'"]')].find(x=>x.offsetParent); if(b)b.click();},t); await pg.waitForTimeout(500);};
function parseCSV(t){ // enough for our own output
  const rows=[]; let row=[],cur='',q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){ if(c==='"'){ if(t[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"') q=true;
    else if(c===','){ row.push(cur); cur=''; }
    else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
    else if(c!=='\r') cur+=c;
  }
  if(cur||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
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

 // ---- client with the letterhead fields
 await nav(pg,'clients');
 await pg.click('#btnAddClient'); await pg.waitForTimeout(400);
 await pg.type('#clName','Good Times USA LLC',{delay:10});
 await pg.fill('#clShipTo','Good Times USA LLC\n8408 Temple Terrace HWY\nTampa, FL 33637');
 await pg.fill('#clCustId','HA-5655');
 await pg.fill('#clPermit','FL-TP-99120');
 await pg.click('#saveClientModal'); await pg.waitForTimeout(700);
 const saved=await pg.evaluate(()=>{const c=[...document.querySelectorAll('#clients .client')].find(x=>x.getAttribute('data-name')==='Good Times USA LLC');
   return c?{ship:c.getAttribute('data-shipto'),cust:c.getAttribute('data-custid'),permit:c.getAttribute('data-permit')}:null;});
 ok(saved && /Temple Terrace/.test(saved.ship||''),'client Ship To saved');
 ok(saved && saved.cust==='HA-5655' && saved.permit==='FL-TP-99120','Customer ID and Permit # saved');

 // ---- shipment
 await nav(pg,'shipments');
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Good Times USA LLC');
 await pg.type('#nsContainer','SEFU-421573-8',{delay:8});
 await pg.type('#nsPO','73126',{delay:8});
 await pg.type('#nsInvNo','6471',{delay:8});
 await pg.fill('#nsDate','2026-08-13');
 await pg.setInputFiles('#nsFile', path.resolve('needmaj-full.xlsx'));
 await pg.waitForTimeout(1500);
 await pg.click('#saveNewShip'); await pg.waitForTimeout(1600);
 if(!(await pg.$('#scanInput'))){ await pg.click('[data-open-ship]'); await pg.waitForTimeout(600); }

 // ---- scan something NOT on the slip, then delete those scans
 await pg.click('#scanInput'); await pg.type('#scanInput','999888777666',{delay:8});
 await pg.press('#scanInput','Enter'); await pg.waitForTimeout(600);
 if(await pg.$('#enrollPanel')){
   // register it as a brand new product not on the slip
   const rj=await pg.$('#btnEnrollReject'); if(rj){ await rj.click(); await pg.waitForTimeout(500); }
 }
 // build a real "unexpected" item: a catalogue product with a barcode, absent from the slip
 await pg.evaluate(()=>{
   const d=document.createElement('div'); d.className='sku';
   d.setAttribute('data-rid','extra-1'); d.setAttribute('data-sku','ITM-EXTRA');
   d.setAttribute('data-desc','Sweetwoods Cigars Russian Cream 720 ct'); d.setAttribute('data-flavor','RUSSIAN CREAM');
   d.setAttribute('data-barcodes','842426156974'); d.setAttribute('data-active','true');
   document.querySelector('#skuMaster').appendChild(d);
 });
 await pg.click('#scanInput'); await pg.type('#scanInput','842426156974',{delay:8});
 await pg.press('#scanInput','Enter'); await pg.waitForTimeout(700);
 let extraCount=await pg.evaluate(()=>[...document.querySelectorAll('#shipments .shipment .scan')]
   .filter(s=>s.getAttribute('data-void')!=='true' && s.getAttribute('data-sku')==='ITM-EXTRA').length);
 ok(extraCount===1,'an unexpected item was scanned ('+extraCount+')');
 ok(!!(await pg.$('[data-del-extra]')),'the unexpected row has a delete button');
 await pg.click('[data-del-extra]'); await pg.waitForTimeout(400);
 await pg.click('#doConfirmDel'); await pg.waitForTimeout(800);
 extraCount=await pg.evaluate(()=>[...document.querySelectorAll('#shipments .shipment .scan')]
   .filter(s=>s.getAttribute('data-void')!=='true' && s.getAttribute('data-sku')==='ITM-EXTRA').length);
 ok(extraCount===0,'deleting the unexpected scans drops the count to 0');
 const stillLogged=await pg.evaluate(()=>[...document.querySelectorAll('#shipments .shipment .scan')]
   .filter(s=>s.getAttribute('data-sku')==='ITM-EXTRA').length);
 ok(stillLogged===1,'the voided scan is still in the record, not erased');

 // ---- manual line, then delete it
 await pg.click('#btnAddLine'); await pg.waitForTimeout(400);
 await pg.fill('#alDesc','MANUAL TEST LINE'); await pg.fill('#alQty','5');
 await pg.click('#saveAddLine'); await pg.waitForTimeout(800);
 let manual=await pg.evaluate(()=>[...document.querySelectorAll('#shipments .shipment .line')]
   .filter(l=>/MANUAL TEST LINE/.test(l.getAttribute('data-desc')||'')).length);
 ok(manual===1,'manual line added');
 const delSel=await pg.evaluate(()=>{const l=[...document.querySelectorAll('#shipments .shipment .line')]
   .find(x=>/MANUAL TEST LINE/.test(x.getAttribute('data-desc')||'')); return l?l.getAttribute('data-sku'):null;});
 await pg.click('[data-del-line="'+delSel+'"]'); await pg.waitForTimeout(400);
 await pg.click('#doConfirmDel'); await pg.waitForTimeout(800);
 manual=await pg.evaluate(()=>[...document.querySelectorAll('#shipments .shipment .line')]
   .filter(l=>/MANUAL TEST LINE/.test(l.getAttribute('data-desc')||'')).length);
 ok(manual===0,'manual line deleted');

 // ---- CSV header cell placement
 await pg.click('#btnExportShipment'); await pg.waitForTimeout(800);
 const csv=await pg.evaluate(()=>window.__saved[window.__saved.length-1].data);
 const g=parseCSV(csv);
 const cell=(r,c)=>((g[r]||[])[c]||'').trim();
 console.log('       rows 1-12, cols B..E:');
 for(let r=0;r<12;r++) console.log('        '+String(r+1).padStart(2)+' | '+[1,2,3,4].map(c=>cell(r,c).slice(0,28).padEnd(28)).join('| '));
 ok(cell(1,1)==='NEEDMAJ','B2 = OUR company letterhead, not the client');
 ok(cell(2,1)==='DISTRIBUTORS, LLC','B3 = second letterhead line');
 ok(cell(4,2)==='Good Times USA LLC','C5 = the CLIENT under Ship To');
 ok(cell(1,4)==='Invoice','E2 = Invoice');
 ok(cell(3,1)==='Ship To:','B4 = Ship To:');
 ok(cell(3,3)==='No:'&&cell(3,4)==='6471','D4/E4 = No: / 6471');
 ok(cell(5,3)==='CONTAINER:'&&cell(5,4)==='SEFU-421573-8','D6/E6 = CONTAINER: / value');
 ok(cell(6,1)==='Bill To:','B7 = Bill To:');
 ok(cell(7,3)==='Date:'&&cell(7,4)==='2026-08-13','D8/E8 = Date: / value');
 ok(cell(9,3)==='Customer ID:'&&cell(9,4)==='HA-5655','D10/E10 = Customer ID: / value');
 ok(cell(10,3)==='PERMIT #:'&&cell(10,4)==='FL-TP-99120','D11/E11 = PERMIT #: / value');
 ok(cell(4,2)==='Good Times USA LLC','C5 = first Ship To address line');

 // ---- printable sheet
 await pg.click('#btnExportPrintable'); await pg.waitForTimeout(900);
 const last=await pg.evaluate(()=>window.__saved[window.__saved.length-1]);
 ok(/\.html$/.test(last.filename) && !/\.xls\./.test(last.filename),
    'one honest extension, no .xls.html that Windows would hide: '+last.filename);
 ok(/ProgId" content="Excel.Sheet"/.test(last.data),'carries the Excel worksheet marker');
 ok(/x:ExcelWorkbook/.test(last.data),'carries the Excel worksheet directives');
 ok(/mso-number-format/.test(last.data),'barcode columns are forced to text so Excel cannot mangle them');
 // the how-to-open help must be reachable, since the file name confuses Excel
 await pg.click('#btnExcelHelp'); await pg.waitForTimeout(400);
 const help=await pg.textContent('#excelHelpBack');
 ok(/will not appear under/i.test(help),'the ? says Excel will not be in the Open with menu');
 ok(/Drag it in/i.test(help)&&/All Files/.test(help),'it gives the two routes that do work');
 ok(/Ctrl/.test(help)&&/print/i.test(help),'it explains printing straight from the browser');

 ok(/\.xlsx/.test(help),'it says how to keep it as a real .xlsx');
 ok(/PROTECTED VIEW/.test(help)&&/Enable Editing/.test(help),'it covers Excel Protected View, which blocks editing on downloaded files');
 ok(/every cell editable/.test(help),'it states the sheet is editable once open');
 await pg.click('#okExcelHelp'); await pg.waitForTimeout(300);
 ok(!(await pg.$('#excelHelpBack')),'the help closes');
 const h=last.data;
 ok(/NEEDMAJ/.test(h)&&/DISTRIBUTORS, LLC/.test(h),'letterhead block present');
 ok(/Good Times USA LLC/.test(h),'the client appears under Ship To, not in the letterhead');
 ok(/>Invoice</.test(h),'Invoice title present');
 ok(/PERMIT #:/.test(h)&&/#c00000/.test(h),'PERMIT # present and styled red');
 ok(/Ship To:/.test(h)&&/Bill To:/.test(h)&&/Temple Terrace/.test(h),'Ship To / Bill To with the address');
 ok(/CONTAINER:/.test(h)&&/SEFU-421573-8/.test(h),'container on the printable sheet');
 ok(/Quantity of Master Cases/.test(h),'the line table is included');
 fs.writeFileSync('printable-sample.html',h);

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

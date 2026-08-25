const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
let fails=[]; function ok(c,m){console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails.push(m);}
// the customer's real container 5665 / FBLU-021991-7, as the slip states it
const EXPECT={'GT Cigarillos Flavored Kash':2,'GT Cigarillos Mini Flavored Watermelon':14,
 'GT Cigarillos Mini Flavored Blueberry':15,'GT Black Smooth cigars Kash':1,
 'Sweetwoods Cigars Blue Raspberry 720 ct 5Pk':3,'Sweetwoods Cigars Sweet Aroma':300,
 'Sweetwoods Cigars Natural':1,'Sweetwoods Cigars Russian Cream':96,
 'Sweetwoods Cigars Vanilla':417,'Sweetwoods California Cigars Aromatic':7,
 'Sweetwoods California Cigars Smooth':13,'Sweetwoods California Cigars White':16,
 'GT Black Smooth cigars Peach':2,'GT Black Smooth cigars Black Classic':3,
 'Countryman Cigars Robusto':4,'Flat Wrap Cigar Wrapper':23,
 'Sweetwoods Natural Whole Leaf':4,'Sweetwoods Leaf Wrap Grabba Caribbean Vibes':63};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const dev of [{name:'desktop',viewport:{width:1400,height:900}},
                   {name:'iPhone 13',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}]){
 console.log('\n=== '+dev.name+' ===');
 const ctx=await b.newContext(dev);
 await ctx.addInitScript(()=>{ window.claude={use:async()=>null}; });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto('file://'+path.resolve('wrapped-seed.html')); await pg.waitForTimeout(600);
 await pg.waitForSelector('#loginForm');
 await pg.selectOption('#loginName',{index:0});
 await pg.type('#loginPin','1234',{delay:15});
 await pg.click('#loginForm button[type=submit]'); await pg.waitForTimeout(500);
 await pg.click('#btnNewShipment'); await pg.waitForTimeout(400);
 await pg.fill('#nsClient','Goodtime');
 await pg.setInputFiles('#nsFile', path.resolve('slip5665.xlsx'));
 await pg.waitForTimeout(2500);

 // the slip's own header block is read
 ok(await pg.inputValue('#nsInvNo')==='6485','Invoice No. read from the slip (No: 6485)');
 ok(await pg.inputValue('#nsContainer')==='FBLU-021991-7','Container read from the slip');
 ok(await pg.inputValue('#nsCustId')==='JKI-5663','Customer ID read from the slip');

 // green column = the quantity, and the slip's grand total row is not a line
 const prev=await pg.$$eval('#nsPreview tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.trim())));
 ok(prev.length===20,'20 product lines, the totals row is not one of them (got '+prev.length+')');
 const total=prev.reduce((a,r)=>a+parseInt(r[2]||'0',10),0);
 ok(total===1235,'total = 1235 boxes, exactly what the slip says (got '+total+')');
 let wrong=[];
 Object.keys(EXPECT).forEach(k=>{
   const row=prev.find(r=>r[1].indexOf(k)===0);
   if(!row || parseInt(row[2],10)!==EXPECT[k]) wrong.push(k+': expected '+EXPECT[k]+', got '+(row?row[2]:'missing'));
 });
 ok(wrong.length===0,'every line matches the green column'+(wrong.length? ':\n      '+wrong.join('\n      '):''));

 // the dropdown totals must not double-count the totals row
 const opts=await pg.$$eval('#mapQty option',o=>o.map(x=>x.textContent));
 ok(!opts.some(t=>/2,470/.test(t)),'no column total is doubled by the slip\'s own total row');
 ok(opts.some(t=>/Master Cases/.test(t)&&/1,235/.test(t)),'the Master Cases column reports 1,235');

 // pallets: mauve column, and scientific notation must not be misread
 await pg.click('#saveNewShip'); await pg.waitForTimeout(2000);
 const sh=await pg.evaluate(()=>{const s=document.querySelector('#shipments .shipment');
   return {p:s.getAttribute('data-pallets'), n:s.getAttribute('data-palletnotes'), l:s.querySelectorAll('.line').length};});
 ok(sh.p==='27','pallets = 27, from the slip\'s 26.78 (got '+sh.p+')');
 ok(/26\.78/.test(sh.n),'the note quotes the slip\'s own 26.78 figure: '+sh.n);
 ok(/195 loose/.test(sh.n),'195 loose boxes, from the pink column');
 ok(sh.l===20,'20 lines created');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 await ctx.close();
 }
 await b.close();
 console.log('\n'+(fails.length? fails.length+' FAILURE(S):\n - '+fails.join('\n - '):'ALL CHECKS PASSED'));
 process.exit(fails.length?1:0);
})();

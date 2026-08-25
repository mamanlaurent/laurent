const fs=require('fs');
const body=fs.readFileSync('dockside-receiving.html','utf8');
const SEED=`<div id="db" hidden>
  <div id="settings" data-teampin="1234" data-seeded="true" data-company="NEEDMAJ" data-companysub="DISTRIBUTORS, LLC" data-companyaddr="" data-companypermit=""></div>
  <div id="roster">
    <div class="employee" data-rid="u-owner" data-name="Owner" data-role="admin" data-active="true" data-owner="true"></div>
    <div class="employee" data-rid="u-demo" data-name="Sam (demo employee)" data-role="employee" data-active="true" data-owner="false"></div>
  </div>
  <div id="skuMaster">
    <div class="sku" data-rid="sk-demo1" data-sku="DEMO-100" data-desc="Sample Item — 12oz Widget" data-barcodes="012345678905" data-active="true"></div>
    <div class="sku" data-rid="sk-demo2" data-sku="DEMO-200" data-desc="Sample Item — Case of 6" data-barcodes="098765432109,611234567890" data-active="true"></div>
  </div>
  <div id="clients"></div>
  <div id="shipments"></div>
  <div id="auditLog"></div>
</div>`;
function wrap(b,out){ fs.writeFileSync(out,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'+b+'</body></html>'); }
wrap(body,'wrapped.html');
// same code, seed data — what the regression suites were written against
const lines=body.split('\n');
const start=lines.findIndex(l=>l.startsWith('<div id="db"'));
let end=-1;
for(let i=start+1;i<lines.length;i++){ if(lines[i].trim()==='</div>' && lines[i-1].trim().startsWith('<div id="auditLog"')){ end=i; break; } }
if(start<0||end<0) throw new Error('could not locate #db');
wrap(lines.slice(0,start).concat(SEED.split('\n'), lines.slice(end+1)).join('\n'),'wrapped-seed.html');
console.log('wrapped.html (live data) + wrapped-seed.html (seed data)');

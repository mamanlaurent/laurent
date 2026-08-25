// Minimal XLSX writer (stored, no compression) — enough to feed the app's reader.
const fs=require('fs'), zlib=require('zlib');
function crc32(buf){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}
 let x=0xFFFFFFFF;for(let i=0;i<buf.length;i++)x=t[(x^buf[i])&0xFF]^(x>>>8);return (x^0xFFFFFFFF)>>>0;}
function zip(files){
 let parts=[],cd=[],off=0;
 for(const f of files){
  const name=Buffer.from(f.name),data=Buffer.from(f.data);
  const crc=crc32(data);
  const lh=Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0,6);lh.writeUInt16LE(0,8);
  lh.writeUInt16LE(0,10);lh.writeUInt16LE(0,12);lh.writeUInt32LE(crc,14);
  lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(data.length,22);
  lh.writeUInt16LE(name.length,26);lh.writeUInt16LE(0,28);
  parts.push(lh,name,data);
  const ch=Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);
  ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);
  ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(off,42);
  cd.push(ch,name);
  off+=30+name.length+data.length;
 }
 const cdBuf=Buffer.concat(cd);
 const eocd=Buffer.alloc(22);
 eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(files.length,8);eocd.writeUInt16LE(files.length,10);
 eocd.writeUInt32LE(cdBuf.length,12);eocd.writeUInt32LE(off,16);
 return Buffer.concat([Buffer.concat(parts),cdBuf,eocd]);
}
function colName(n){let s='';n++;while(n>0){let r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=(n-1-r)/26;}return s;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sheet(rows){
 let out='<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
 rows.forEach((r,ri)=>{
  out+='<row r="'+(ri+1)+'">';
  r.forEach((v,ci)=>{
   if(v===''||v==null)return;
   const ref=colName(ci)+(ri+1);
   if(typeof v==='number') out+='<c r="'+ref+'"><v>'+v+'</v></c>';
   else out+='<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
  });
  out+='</row>';
 });
 return out+'</sheetData></worksheet>';
}
module.exports={zip,sheet};
if(require.main===module){
 const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const files=[
  {name:'[Content_Types].xml',data:'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
  {name:'_rels/.rels',data:'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {name:'xl/workbook.xml',data:'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'},
  {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
  {name:'xl/worksheets/sheet1.xml',data:sheet(rows)}
 ];
 fs.writeFileSync(process.argv[3], zip(files));
 console.log('wrote', process.argv[3]);
}

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const dir = path.join(__dirname, '..', 'test', 'fixtures');
const uri = term => 'http://cv.iptc.org/newscodes/digitalsourcetype/' + term;
function segment(marker, data) { const h = Buffer.alloc(4); h[0] = 255; h[1] = marker; h.writeUInt16BE(data.length + 2, 2); return Buffer.concat([h, data]); }
function plainJpeg() {
  const q = Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)]);
  const sof = Buffer.from([8,0,1,0,1,1,1,0x11,0]);
  const dc = Buffer.concat([Buffer.from([0,1]), Buffer.alloc(15), Buffer.from([0])]);
  const ac = Buffer.concat([Buffer.from([0x10,1]), Buffer.alloc(15), Buffer.from([0])]);
  return Buffer.concat([Buffer.from([255,216]), segment(219,q), segment(192,sof), segment(196,Buffer.concat([dc,ac])), segment(218,Buffer.from([1,1,0,0,63,0])), Buffer.from([63,255,217])]);
}
function crc32(b) { let c = 0xffffffff; for (const v of b) { c ^= v; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]), h = Buffer.alloc(4), c = Buffer.alloc(4); h.writeUInt32BE(data.length); c.writeUInt32BE(crc32(body)); return Buffer.concat([h,body,c]); }
function png(chunks = []) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1,4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR',ihdr), ...chunks, chunk('IDAT',zlib.deflateSync(Buffer.from([0,128,128,128]))), chunk('IEND',Buffer.alloc(0))]); }
function withXmp(jpeg, term, element = false) {
  const value = uri(term);
  const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"' + (element ? '><Iptc4xmpExt:DigitalSourceType>' + value + '</Iptc4xmpExt:DigitalSourceType><xmp:CreatorTool>Test &amp; Tool</xmp:CreatorTool>' : ' Iptc4xmpExt:DigitalSourceType="' + value + '" xmp:CreatorTool="Test Tool">') + '</rdf:Description></rdf:RDF></x:xmpmeta>';
  return Buffer.concat([jpeg.subarray(0,2), segment(225,Buffer.from('http://ns.adobe.com/xap/1.0/\0' + xmp)), jpeg.subarray(2)]);
}
function stripApp11(b) {
  const parts = [b.subarray(0,2)]; let p = 2;
  while (p + 4 <= b.length && b[p] === 255 && b[p + 1] !== 218 && b[p + 1] !== 217) { const n = b.readUInt16BE(p + 2) + 2; if (b[p + 1] !== 235) parts.push(b.subarray(p,p+n)); p += n; }
  parts.push(b.subarray(p)); return Buffer.concat(parts);
}
function jpegStore(b) {
  const packets = []; let p = 2;
  while (p + 4 <= b.length && b[p] === 255 && b[p+1] !== 218 && b[p+1] !== 217) { const n = b.readUInt16BE(p+2)+2, d = b.subarray(p+4,p+n); if (b[p+1] === 235 && d.toString('ascii',0,2) === 'JP') packets.push({ seq: d.readUInt32BE(4), data: d.subarray(d.readUInt32BE(4) === 1 ? 8 : 16) }); p += n; }
  return Buffer.concat(packets.sort((a,b)=>a.seq-b.seq).map(p=>p.data));
}
function box(type, data) { const h = Buffer.alloc(8); h.writeUInt32BE(data.length+8); h.write(type,4); return Buffer.concat([h,data]); }
function cbor(v) {
  function head(m,n) { if (n < 24) return Buffer.from([m*32+n]); if (n < 256) return Buffer.from([m*32+24,n]); if (n < 65536) { const b=Buffer.alloc(3);b[0]=m*32+25;b.writeUInt16BE(n,1);return b; }const b=Buffer.alloc(5);b[0]=m*32+26;b.writeUInt32BE(n,1);return b; }
  if (v === null) return Buffer.from([246]); if (typeof v === 'boolean') return Buffer.from([v?245:244]);
  if (typeof v === 'number') return head(v<0?1:0,v<0?-1-v:v);
  if (typeof v === 'string') { const b=Buffer.from(v);return Buffer.concat([head(3,b.length),b]); }
  if (v instanceof Uint8Array) return Buffer.concat([head(2,v.length),v]);
  if (Array.isArray(v)) return Buffer.concat([head(4,v.length),...v.map(cbor)]);
  const entries=Object.entries(v);return Buffer.concat([head(5,entries.length),...entries.flatMap(([k,v])=>[cbor(k),cbor(v)])]);
}
function superbox(label, children) { return box('jumb',Buffer.concat([box('jumd',Buffer.concat([Buffer.alloc(16),Buffer.from([3]),Buffer.from(label+'\0')])),...children])); }
function testStore(sourceType, action='c2pa.created', info={name:'Fixture Tool'}) {
  const assertions=superbox('c2pa.assertions',[superbox('c2pa.actions.v2',[box('cbor',cbor({actions:[{action,digitalSourceType:uri(sourceType)}]}))])]);
  const claim=superbox('c2pa.claim.v2',[box('cbor',cbor({claim_generator_info:info,signature:'self#jumbf=c2pa.signature'}))]);
  const signature=superbox('c2pa.signature',[box('cbor',cbor([Buffer.alloc(0),{},null,Buffer.alloc(0)]))]);
  return superbox('c2pa',[superbox('urn:uuid:fixture',[assertions,claim,signature])]);
}
function jpegWithStore(store) { const h=Buffer.alloc(8);h.write('JP');h.writeUInt16BE(1,2);h.writeUInt32BE(1,4);const j=plainJpeg();return Buffer.concat([j.subarray(0,2),segment(235,Buffer.concat([h,store])),j.subarray(2)]); }
function generate() {
  fs.mkdirSync(dir,{recursive:true}); const j=plainJpeg();
  const c=fs.readFileSync(path.join(dir,'C.jpg')), store=jpegStore(c);
  const fixtures={
    'plain.jpg':j, 'xmp-ai.jpg':withXmp(j,'trainedAlgorithmicMedia'), 'xmp-camera.jpg':withXmp(j,'digitalCapture',true),
    'sd.png':png([chunk('tEXt',Buffer.from('parameters\0Stable Diffusion, steps: 20, seed: 42'))]),
    'comfy.png':png([chunk('tEXt',Buffer.from('prompt\0{"1":{"class_type":"KSampler"}}'))]),
    'stripped.jpg':stripApp11(c), 'corrupt.jpg':jpegWithStore(store.subarray(0,Math.floor(store.length/2))),
    'c2pa-derived.png':png([chunk('caBX',store)])
  };
  for (const [f,b] of Object.entries(fixtures)) fs.writeFileSync(path.join(dir,f),b);
  console.log('Generated '+Object.keys(fixtures).length+' deterministic fixtures.');
}
if (require.main === module) generate();
module.exports={plainJpeg,segment,png,chunk,withXmp,stripApp11,jpegStore,box,cbor,superbox,testStore,jpegWithStore};

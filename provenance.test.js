'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { X509Certificate } = require('node:crypto');
const P = require('./provenance');
const F = require('./scripts/make-fixtures');
const read = f => fs.readFileSync(path.join(__dirname,'test','fixtures',f));
const inspect = f => P.inspect(read(f),f);
const source = (r,s) => r.signals.find(x=>x.source===s);
const uri = t => 'http://cv.iptc.org/newscodes/digitalsourcetype/'+t;
const fixtures = ['C.jpg','CA.jpg','video1.mp4','plain.jpg','xmp-ai.jpg','xmp-camera.jpg','sd.png','comfy.png','stripped.jpg','corrupt.jpg','c2pa-derived.png'];

for (const f of ['C.jpg','CA.jpg','video1.mp4','c2pa-derived.png']) test('reads signed store in '+f,()=>{
  const r=inspect(f), s=source(r,'c2pa');
  assert.equal(r.verdict,'credentials_no_ai_claim'); assert.equal(s.found,true);
  assert.equal(s.value.signer.organization,'C2PA Test Signing Cert'); assert.equal(s.value.signer.commonName,'C2PA Signer');
  assert.equal(s.value.generator,f==='video1.mp4'?'TestApp c2patool/0.6.2 c2pa-rs/0.28.2':'make_test_images/0.33.1 c2pa-rs/0.33.1');
  assert.match(s.detail,/Signature not checked here/); assert.equal(s.verifyUrl,'https://contentcredentials.org/verify');
  if (f==='CA.jpg') { assert.equal(s.value.ingredients,1); assert.deepEqual(s.value.actions.map(a=>a.action),['c2pa.opened','c2pa.color_adjustments']); }
  else if(f==='video1.mp4') { assert.equal(s.value.ingredients,1); assert.equal(s.value.actions[0].action,'c2pa.opened'); }
  else { assert.equal(s.value.actions[0].action,'c2pa.created'); assert.equal(s.value.actions[0].digitalSourceType,uri('algorithmicMedia')); }
});
for (const [f,verdict] of [['plain.jpg','no_labels'],['xmp-ai.jpg','ai_generated'],['xmp-camera.jpg','no_labels'],['sd.png','ai_hint'],['comfy.png','ai_hint'],['stripped.jpg','no_labels'],['corrupt.jpg','credentials_no_ai_claim']]) test('verdict for '+f,()=>{
  const r=inspect(f);assert.equal(r.verdict,verdict);assert.equal(source(r,'watermark').found,null);
  if (f==='xmp-ai.jpg') { assert.equal(source(r,'xmp').value.digitalSourceTypes[0],uri('trainedAlgorithmicMedia')); assert.equal(source(r,'xmp').value.creatorTool,'Test Tool'); }
  if (f==='xmp-camera.jpg') { assert.equal(source(r,'xmp').value.digitalSourceTypes[0],uri('digitalCapture'));assert.equal(source(r,'xmp').value.creatorTool,'Test & Tool'); }
  if (f==='sd.png') assert.equal(source(r,'meta').value,'Stable Diffusion, steps: 20, seed: 42');
  if (f==='comfy.png') assert.equal(source(r,'meta').value,'{"1":{"class_type":"KSampler"}}');
  if (f==='corrupt.jpg') { assert.equal(source(r,'c2pa').found,true);assert.match(source(r,'c2pa').detail,/present but could not be parsed/); }
  if (verdict==='no_labels') assert.match(r.notes.join(' '),/doesn't mean a person made it/);
  assert.equal(r.creatorNote.length,/^ai_/.test(verdict)?3:0);
});
test('every fixture fits the budget',()=>{
  let total=0; for(const f of fs.readdirSync(path.join(__dirname,'test','fixtures'))) {const n=read(f).length;total+=n;assert.ok(n<1024*1024,f);} assert.ok(total<3*1024*1024);
});
test('compare reports stripped credentials and all IDs including unknown watermark',()=>{
  const d=P.compare(inspect('C.jpg'),inspect('stripped.jpg'));
  assert.equal(d.entries.find(e=>e.id==='c2pa').status,'stripped');assert.equal(d.summary,'1 of 1 labels were stripped');
  assert.equal(d.entries.find(e=>e.id==='watermark').status,'unknown');assert.equal(d.entries.find(e=>e.id==='xmp').status,'absent');assert.equal(d.entries.length,4);
});
test('compare kept, changed, added and stripped, independent of object key order',()=>{
  const a={signals:[{id:'a',source:'xmp',found:true,value:{x:1,y:2}},{id:'b',source:'meta',found:true,value:'old'}]};
  const b={signals:[{id:'a',source:'xmp',found:true,value:{y:2,x:1}},{id:'b',source:'meta',found:true,value:'new'},{id:'c',source:'meta',found:true,value:'added'}]};
  assert.deepEqual(P.compare(a,b).entries.map(e=>e.status),['kept','changed','added']);
});
test('CBOR integers, negative, bytes, text, arrays and maps',()=>{
  const values=[0,23,24,255,256,65535,65536,-1,-500,'hello',Buffer.from([0,255]),[1,'two'],{name:'value'}];
  for(const v of values){const got=P.decodeCBOR(F.cbor(v));if(v instanceof Uint8Array)assert.deepEqual(Array.from(got),Array.from(v));else if(v&&typeof v==='object'&&!Array.isArray(v))assert.equal(got.name,'value');else assert.deepEqual(got,v);}
  assert.equal(P.decodeCBOR(Buffer.from('1b0000000100000000','hex')),4294967296);
});
test('CBOR indefinite arrays, maps, bytes, text, tags, floats, booleans and null',()=>{
  assert.deepEqual(P.decodeCBOR(Buffer.from('9f0102ff','hex')),[1,2]);
  assert.equal(P.decodeCBOR(Buffer.from('bf616101ff','hex')).a,1);
  assert.deepEqual(Array.from(P.decodeCBOR(Buffer.from('5f4201024103ff','hex'))),[1,2,3]);
  assert.equal(P.decodeCBOR(Buffer.from('7f61616162ff','hex')),'ab');
  assert.equal(P.decodeCBOR(Buffer.from('d82a6161','hex')),'a');
  for(const [hex,v] of [['f4',false],['f5',true],['f6',null],['f93e00',1.5],['fa3fc00000',1.5],['fb3ff8000000000000',1.5]]) assert.equal(P.decodeCBOR(Buffer.from(hex,'hex')),v);
  for(const hex of ['ff','9f01','5f6161ff','bf6161ff','1bffffffffffffffff'])assert.throws(()=>P.decodeCBOR(Buffer.from(hex,'hex')));
});
test('DER subject matches the known public fixture certificate and Node independent reader',()=>{
  const cert=new X509Certificate(read('es256-cert.crt'));
  const s=P.certificateSubject(cert.raw);assert.deepEqual(s,{organization:'C2PA Test Signing Cert',commonName:'C2PA Signer'});
  assert.match(cert.subject,/O=C2PA Test Signing Cert/);assert.match(cert.subject,/CN=C2PA Signer/);
});
test('verdict priority, v2 claim map and array, conflict',()=>{
  for(const [t,action,verdict] of [['trainedAlgorithmicMedia','c2pa.created','ai_generated'],['trainedAlgorithmicMedia','c2pa.opened','credentials_no_ai_claim'],['compositeWithTrainedAlgorithmicMedia','c2pa.edited','ai_edited'],['digitalCapture','c2pa.created','camera_signed']]){
    const r=P.inspect(F.jpegWithStore(F.testStore(t,action)));assert.equal(r.verdict,verdict);assert.equal(source(r,'c2pa').value.generator,'Fixture Tool');
  }
  assert.equal(source(P.inspect(F.jpegWithStore(F.testStore('digitalCapture','c2pa.created',[{name:'Array Tool'}]))),'c2pa').value.generator,'Array Tool');
  const camera=F.jpegWithStore(F.testStore('digitalCapture'));
  assert.equal(P.inspect(F.withXmp(camera,'trainedAlgorithmicMedia')).verdict,'conflict');
  const ai=F.jpegWithStore(F.testStore('trainedAlgorithmicMedia'));
  assert.equal(P.inspect(F.withXmp(ai,'digitalCapture')).verdict,'conflict');
  assert.equal(P.inspect(F.withXmp(F.plainJpeg(),'compositeWithTrainedAlgorithmicMedia')).verdict,'ai_edited');
});
test('active last manifest only, not an earlier AI ingredient',()=>{
  const ai=F.testStore('trainedAlgorithmicMedia'),camera=F.testStore('digitalCapture');
  function child(store){const n=store.readUInt32BE(8);return store.subarray(8+n);}
  const store=F.superbox('c2pa',[child(ai),child(camera)]);
  const r=P.inspect(F.jpegWithStore(store));assert.equal(r.verdict,'camera_signed');
});
test('AI claim in a parent ingredient manifest carries to the active manifest',()=>{
  // Shape of a ChatGPT/DALL-E file: the generator's manifest is the parent of a "converted" one.
  const made=F.testManifest('urn:uuid:made',[['c2pa.created','trainedAlgorithmicMedia']],[],{name:'DALL-E'});
  const converted=F.testManifest('urn:uuid:converted',[['c2pa.converted']],[{manifest:'urn:uuid:made',relationship:'parentOf',title:'image.png'}],{name:'ChatGPT'});
  const r=P.inspect(F.jpegWithStore(F.superbox('c2pa',[made,converted]))),s=source(r,'c2pa');
  assert.equal(r.verdict,'ai_generated');assert.equal(s.value.generator,'ChatGPT');
  assert.deepEqual(s.value.inherited.map(i=>[i.kind,i.generator,i.action]),[['generated','DALL-E','c2pa.created']]);
  assert.match(s.detail,/AI claims in ingredient manifests: DALL-E \(c2pa\.created, AI-generated\) via parentOf "image\.png"/);
  const grand=F.testManifest('urn:uuid:resized',[['c2pa.resized']],[{manifest:'urn:uuid:converted',relationship:'parentOf',title:'b.jpg'}]);
  assert.equal(P.inspect(F.jpegWithStore(F.superbox('c2pa',[made,converted,grand]))).verdict,'ai_generated');
});
test('AI component ingredient or AI edit action means edited with AI',()=>{
  const part=F.testManifest('urn:uuid:part',[['c2pa.created','trainedAlgorithmicMedia']]);
  const doc=F.testManifest('urn:uuid:doc',[['c2pa.placed']],[{manifest:'urn:uuid:part',relationship:'componentOf',title:'sky'}]);
  assert.equal(P.inspect(F.jpegWithStore(F.superbox('c2pa',[part,doc]))).verdict,'ai_edited');
  for(const action of ['c2pa.edited','c2pa.placed'])assert.equal(P.inspect(F.jpegWithStore(F.testStore('trainedAlgorithmicMedia',action))).verdict,'ai_edited');
  const opened=F.testManifest('urn:uuid:open',[['c2pa.opened','trainedAlgorithmicMedia']]);
  const child=F.testManifest('urn:uuid:child',[['c2pa.resized']],[{manifest:'urn:uuid:open',relationship:'parentOf'}]);
  assert.equal(P.inspect(F.jpegWithStore(F.superbox('c2pa',[opened,child]))).verdict,'credentials_no_ai_claim');
});
test('ingredient links tolerate cycles, missing manifests and v1 c2pa_manifest references',()=>{
  const a=F.testManifest('urn:uuid:a',[['c2pa.created','trainedAlgorithmicMedia']],[{manifest:'urn:uuid:b',relationship:'parentOf'}]);
  const b=F.testManifest('urn:uuid:b',[['c2pa.converted']],[{manifest:'urn:uuid:a',relationship:'parentOf'},{manifest:'urn:uuid:gone',relationship:'parentOf'}]);
  const r=P.inspect(F.jpegWithStore(F.superbox('c2pa',[a,b])));assert.equal(r.verdict,'ai_generated');assert.equal(source(r,'c2pa').value.inherited.length,1);
  const v1=F.testManifest('urn:uuid:v1',[['c2pa.converted']],[{manifest:'urn:uuid:a',relationship:'parentOf',key:'c2pa_manifest'}]);
  assert.equal(P.inspect(F.jpegWithStore(F.superbox('c2pa',[F.testManifest('urn:uuid:a',[['c2pa.created','trainedAlgorithmicMedia']]),v1]))).verdict,'ai_generated');
});
test('APP11 packet sequence is sorted and missing packet remains present but unparsed',()=>{
  const original=read('CA.jpg');let p=2;const parts=[],other=[];
  while(p+4<original.length&&original[p]===255&&original[p+1]!==218){const n=original.readUInt16BE(p+2)+2;(original[p+1]===235?parts:other).push(original.subarray(p,p+n));p+=n;}
  const shuffled=Buffer.concat([original.subarray(0,2),...other,...parts.reverse(),original.subarray(p)]);
  assert.equal(source(P.inspect(shuffled),'c2pa').value.ingredients,1);
  const missing=Buffer.concat([original.subarray(0,2),...other,parts[0],original.subarray(p)]);
  const s=source(P.inspect(missing),'c2pa');assert.equal(s.found,true);assert.match(s.detail,/could not be parsed/);
});
test('WebP and BMFF UUID embeddings, extended boxes, raw fallback',()=>{
  const store=F.jpegStore(read('C.jpg'));
  const ch=Buffer.alloc(8);ch.write('C2PA');ch.writeUInt32LE(store.length,4);const riff=Buffer.alloc(12);riff.write('RIFF');riff.writeUInt32LE(4+8+store.length+(store.length&1),4);riff.write('WEBP',8);
  assert.equal(source(P.inspect(Buffer.concat([riff,ch,store,Buffer.alloc(store.length&1)])),'c2pa').value.signer.organization,'C2PA Test Signing Cert');
  const uuid=Buffer.from('d8fec3d61b0e483c92975828877ec481','hex'), data=Buffer.concat([uuid,Buffer.alloc(4),Buffer.from('manifest\0'),Buffer.alloc(8),store]);
  const ftyp=F.box('ftyp',Buffer.from('avif0000')), extended=Buffer.alloc(16);extended.writeUInt32BE(1);extended.write('uuid',4);extended.writeBigUInt64BE(BigInt(16+data.length),8);
  for(const file of ['a.mp4','a.mov','a.m4a','a.heic','a.heif','a.avif'])assert.equal(source(P.inspect(Buffer.concat([ftyp,extended,data]),file),'c2pa').value.generator,'make_test_images/0.33.1 c2pa-rs/0.33.1');
  const raw=source(P.inspect(Buffer.concat([Buffer.from('prefix'),store])),'c2pa');assert.equal(raw.found,true);assert.match(raw.detail,/file type is not fully parsed/);
});
test('padding after the manifest store inside its container is ignored',()=>{
  const store=F.jpegStore(read('C.jpg')), pad=Buffer.alloc(3);
  const uuid=Buffer.from('d8fec3d61b0e483c92975828877ec481','hex'), data=Buffer.concat([uuid,Buffer.alloc(4),Buffer.from('manifest\0'),Buffer.alloc(8),store,pad]);
  const mp4=Buffer.concat([F.box('ftyp',Buffer.from('mp420000')),F.box('uuid',data)]);
  assert.equal(source(P.inspect(mp4,'a.mp4'),'c2pa').value.signer.organization,'C2PA Test Signing Cert');
  const padded=Buffer.concat([store,pad]),ch=Buffer.alloc(8);ch.write('C2PA');ch.writeUInt32LE(padded.length,4);const riff=Buffer.alloc(12);riff.write('RIFF');riff.writeUInt32LE(4+8+padded.length+(padded.length&1),4);riff.write('WEBP',8);
  assert.equal(source(P.inspect(Buffer.concat([riff,ch,padded,Buffer.alloc(padded.length&1)])),'c2pa').value.generator,'make_test_images/0.33.1 c2pa-rs/0.33.1');
});
test('inflates stored, fixed and dynamic zlib blocks without runtime dependencies',()=>{
  const raw=Buffer.from('Stable Diffusion '.repeat(1000)+'text 1234567890 '.repeat(333));
  for(const options of [{level:0},{strategy:zlib.constants.Z_FIXED},{level:9}])assert.deepEqual(Buffer.from(P.inflateZlib(zlib.deflateSync(raw,options))),raw);
  const bad=zlib.deflateSync(raw);bad[bad.length-1]^=1;assert.throws(()=>P.inflateZlib(bad),/checksum/);
});
test('PNG tEXt, zTXt and compressed/uncompressed iTXt, plain metadata and truncation',()=>{
  const values=[F.chunk('zTXt',Buffer.concat([Buffer.from('Software\0\0'),zlib.deflateSync(Buffer.from('ComfyUI'))])),F.chunk('iTXt',Buffer.concat([Buffer.from('Description\0\x01\0en\0Translated\0'),zlib.deflateSync(Buffer.from('Made with Google AI'))])),F.chunk('iTXt',Buffer.from('Comment\0\0\0\0\0Ordinary editor'))];
  const r=P.inspect(F.png(values));assert.equal(r.verdict,'ai_hint');assert.equal(r.signals.find(s=>s.id==='meta:png:Software').value,'ComfyUI');assert.equal(r.signals.find(s=>s.id==='meta:png:Comment').aiHint,false);
  const long=P.inspect(F.png([F.chunk('tEXt',Buffer.from('Description\0'+'Sora '.repeat(100)))]));assert.equal(source(long,'meta').value.length,200);
  assert.equal(P.inspect(F.png([F.chunk('tEXt',Buffer.from('Software\0Photo Editor'))])).verdict,'no_labels');
});
test('EXIF Software and ImageDescription (little and big endian)',()=>{
  for(const little of [true,false]){
    const t=Buffer.alloc(80),v=new DataView(t.buffer,t.byteOffset,t.byteLength);t.write(little?'II':'MM');v.setUint16(2,42,little);v.setUint32(4,8,little);v.setUint16(8,2,little);
    for(const [p,tag,q,value] of [[10,305,38,'gpt-image'],[22,270,50,'ordinary text']]){v.setUint16(p,tag,little);v.setUint16(p+2,2,little);v.setUint32(p+4,value.length+1,little);v.setUint32(p+8,q,little);t.write(value,q);}
    const j=F.plainJpeg(),r=P.inspect(Buffer.concat([j.subarray(0,2),F.segment(225,Buffer.concat([Buffer.from('Exif\0\0'),t])),j.subarray(2)]));assert.equal(r.verdict,'ai_hint');assert.equal(r.signals.find(s=>s.id==='meta:exif:Software').value,'gpt-image');assert.equal(r.signals.find(s=>s.id==='meta:exif:ImageDescription').value,'ordinary text');
  }
});
test('XMP in any file and multiple packets, plain source types preserved',()=>{
  const a=F.withXmp(F.plainJpeg(),'algorithmicMedia'),b=F.withXmp(F.plainJpeg(),'compositeSynthetic');
  const r=P.inspect(Buffer.concat([Buffer.from('audio'),a,b]));assert.deepEqual(source(r,'xmp').value.digitalSourceTypes,[uri('algorithmicMedia'),uri('compositeSynthetic')]);
});
test('duplicate metadata has distinct comparison IDs; corrupt last store discards earlier claim',()=>{
  const a=P.inspect(F.png([F.chunk('tEXt',Buffer.from('Comment\0Sora')),F.chunk('tEXt',Buffer.from('Comment\0Veo'))]));
  const b=P.inspect(F.png([F.chunk('tEXt',Buffer.from('Comment\0Sora'))]));
  assert.equal(P.compare(a,b).entries.find(e=>e.id==='meta:png:Comment:2').status,'stripped');
  const store=F.testStore('trainedAlgorithmicMedia');
  const r=P.inspect(F.png([F.chunk('caBX',store),F.chunk('caBX',store.subarray(0,store.length/2))]));
  assert.equal(r.verdict,'credentials_no_ai_claim');assert.equal(source(r,'c2pa').value,null);
});
test('partial scan merges tail labels and states the limitation',()=>{
  const r=P.inspectParts(read('plain.jpg'),F.testStore('trainedAlgorithmicMedia'),'huge.mp4');assert.equal(r.verdict,'ai_generated');assert.match(r.notes[0],/first and last 64 MB/);assert.match(r.notes[0],/may be missed/);
});
test('never throws on 200 seeded random buffers and 10 truncations of every fixture',()=>{
  let state=0x51a7;function rand(){state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}
  for(let i=0;i<200;i++){const b=Buffer.alloc(rand()%4096);for(let j=0;j<b.length;j++)b[j]=rand()&255;assert.doesNotThrow(()=>P.inspect(b));}
  for(const f of fixtures){const b=read(f);for(let i=0;i<10;i++)assert.doesNotThrow(()=>P.inspect(b.subarray(0,rand()%(b.length+1)),f));}
});
test('each verdict comes with a reason that names what decided it',()=>{
  const cases=[
    [inspect('C.jpg'),/none of their actions claim AI/],
    [inspect('corrupt.jpg'),/could not be read/],
    [inspect('xmp-ai.jpg'),/Digital Source Type is trainedAlgorithmicMedia \(creator tool: Test Tool\)\. This label is not signed/],
    [inspect('xmp-camera.jpg'),/unsigned IPTC\/XMP value, camera \(digitalCapture\)/],
    [inspect('sd.png'),/PNG field "parameters"/],
    [inspect('plain.jpg'),/^No Content Credentials, IPTC\/XMP source type or generator metadata were found\.$/],
    [P.inspect(F.jpegWithStore(F.testStore('trainedAlgorithmicMedia'))),/record c2pa\.created with source type trainedAlgorithmicMedia \(generator: Fixture Tool\)/],
    [P.inspect(F.jpegWithStore(F.testStore('trainedAlgorithmicMedia','c2pa.edited'))),/record c2pa\.edited with source type trainedAlgorithmicMedia/],
    [P.inspect(F.jpegWithStore(F.testStore('digitalCapture'))),/camera capture \(digitalCapture\)\. The signature and the camera are not verified here/],
    [P.inspect(F.withXmp(F.jpegWithStore(F.testStore('digitalCapture')),'trainedAlgorithmicMedia')),/camera capture.*XMP source type says AI-generated/],
    [P.inspect(F.png([F.chunk('tEXt',Buffer.from('Software\0Photo Editor'))])),/metadata found names no known AI tool/]
  ];
  for(const [r,re] of cases)assert.match(r.reason,re,r.verdict);
  const made=F.testManifest('urn:uuid:made',[['c2pa.created','trainedAlgorithmicMedia']],[],{name:'DALL-E'});
  const converted=F.testManifest('urn:uuid:converted',[['c2pa.converted']],[{manifest:'urn:uuid:made',relationship:'parentOf'}]);
  assert.match(P.inspect(F.jpegWithStore(F.superbox('c2pa',[made,converted]))).reason,/earlier manifest .*\(generator: DALL-E\) records c2pa\.created with trainedAlgorithmicMedia, and it reaches this file as a parentOf ingredient/);
});

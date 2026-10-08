/* Reads labels, not authenticity. Pure and dependency-free in browsers and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Provenant = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const utf8 = new TextDecoder('utf-8');
  const latin = new TextDecoder('latin1');
  const LIMIT = 4 * 1024 * 1024;
  const headlines = {
    ai_generated: 'Labelled as AI-generated', ai_edited: 'Labelled as edited with AI',
    camera_signed: 'Signed as a camera capture', credentials_no_ai_claim: 'Has Content Credentials, no AI claim',
    ai_hint: 'No formal label, but the metadata points to an AI tool', no_labels: 'No provenance labels found',
    conflict: 'The labels disagree'
  };
  const noLabels = "That doesn't mean a person made it. Screenshots, re-uploads and most editors strip these labels. The invisible SynthID watermark can survive that; use an official checker to read it.";
  const watermarkLinks = [
    { label: 'Google SynthID Detector', url: 'https://synthid.com' },
    { label: 'How to check in Gemini', url: 'https://support.google.com/gemini/answer/16722517?hl=en' },
    { label: 'Verify OpenAI-made images', url: 'https://openai.com/verify' }
  ];
  const creatorNote = [
    { platform: 'YouTube', text: 'Disclose realistic AI-made or meaningfully altered content when uploading, and AI music that is the focus. YouTube may also label C2PA metadata automatically.', url: 'https://support.google.com/youtube/answer/14328491?hl=en' },
    { platform: 'TikTok', text: 'Label AI-generated realistic images, audio and video. TikTok can automatically label uploads carrying Content Credentials.', url: 'https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content' },
    { platform: 'Meta', text: 'Use the disclosure tool for digitally created or altered photorealistic video and realistic-sounding audio on Facebook and Instagram.', url: 'https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/' }
  ];
  const aiPattern = /Stable Diffusion|ComfyUI|Midjourney|DALL[-·]E|Firefly|Imagen|Gemini|Made with Google AI|Edited with Google AI|GPT-4o|gpt-image|Sora|Veo|Flux|NovelAI/i;
  const sourceNames = { trainedAlgorithmicMedia: 'AI-generated', compositeWithTrainedAlgorithmicMedia: 'AI-edited', algorithmicMedia: 'computer-generated (not AI-trained)', digitalCapture: 'camera', compositeSynthetic: 'composite' };
  const term = s => String(s || '').split('/').pop();
  const text = b => utf8.decode(b);
  const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
  const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u32 = (b, p) => view(b).getUint32(p);
  function find(b, s, start = 0) {
    outer: for (let p = start; p <= b.length - s.length; p++) {
      if (b[p] !== s.charCodeAt(0)) continue;
      for (let j = 1; j < s.length; j++) if (b[p + j] !== s.charCodeAt(j)) continue outer;
      return p;
    }
    return -1;
  }
  function concat(parts) {
    const n = parts.reduce((n, p) => n + p.length, 0);
    if (n > 64 * 1024 * 1024) throw Error('manifest store exceeds 64 MB parsing limit');
    const b = new Uint8Array(n); let p = 0;
    for (const part of parts) { b.set(part, p); p += part.length; }
    return b;
  }
  function signal(id, source, found, value, detail, confidence = 'label') {
    return { id, source, found, value, detail, confidence };
  }

  // Resource bounds apply to untrusted nested and compressed metadata.
  function decodeCBOR(b) {
    let p = 0, items = 0;
    const dv = view(b), BREAK = Symbol('break');
    function take(n) { if (!Number.isSafeInteger(n) || n < 0 || p + n > b.length) throw Error('truncated CBOR'); const q = p; p += n; return q; }
    function length(a) {
      if (a < 24) return a;
      if (a === 24) return b[take(1)];
      if (a === 25) return dv.getUint16(take(2));
      if (a === 26) return dv.getUint32(take(4));
      if (a === 27) { const q = take(8); const n = dv.getUint32(q) * 4294967296 + dv.getUint32(q + 4); if (!Number.isSafeInteger(n)) throw Error('CBOR integer exceeds safe range'); return n; }
      if (a === 31) return -1;
      throw Error('invalid CBOR length');
    }
    function read(depth, allowBreak = false) {
      if (depth > 64 || ++items > 100000) throw Error('CBOR nesting or item limit');
      const h = b[take(1)], major = h >> 5, a = h & 31;
      if (major === 7) {
        if (a === 31) { if (!allowBreak) throw Error('unexpected CBOR break'); return BREAK; }
        if (a === 20 || a === 21) return a === 21;
        if (a === 22) return null;
        if (a === 23) return undefined;
        if (a === 25) { const v = dv.getUint16(take(2)), sign = v & 32768 ? -1 : 1, e = (v >> 10) & 31, m = v & 1023; return sign * (e === 31 ? (m ? NaN : Infinity) : e === 0 ? m * 2 ** -24 : (1 + m / 1024) * 2 ** (e - 15)); }
        if (a === 26) return dv.getFloat32(take(4));
        if (a === 27) return dv.getFloat64(take(8));
        return a === 24 ? b[take(1)] : a;
      }
      const n = length(a);
      if (major <= 1) { if (n < 0) throw Error('indefinite CBOR integer'); return major === 0 ? n : -1 - n; }
      if (major === 2 || major === 3) {
        if (n >= 0) { const q = take(n); return major === 2 ? b.slice(q, q + n) : text(b.subarray(q, q + n)); }
        const chunks = [];
        while (true) { const v = read(depth + 1, true); if (v === BREAK) break; if ((major === 2 && !(v instanceof Uint8Array)) || (major === 3 && typeof v !== 'string')) throw Error('invalid CBOR string chunk'); chunks.push(v); }
        return major === 2 ? concat(chunks) : chunks.join('');
      }
      if (major === 4 || major === 5) {
        const out = major === 4 ? [] : Object.create(null);
        if (n > 100000) throw Error('CBOR collection limit');
        for (let i = 0; n < 0 || i < n; i++) {
          const key = read(depth + 1, n < 0); if (key === BREAK) break;
          if (major === 4) out.push(key);
          else out[String(key)] = read(depth + 1);
        }
        return out;
      }
      if (major === 6) { if (n < 0) throw Error('invalid CBOR tag'); return read(depth + 1); }
      throw Error('invalid CBOR major type');
    }
    return read(0);
  }

  function derNode(b, p, end) {
    if (p + 2 > end) throw Error('truncated DER');
    const tag = b[p++]; let n = b[p++];
    if (n & 128) { const count = n & 127; if (!count || count > 4 || p + count > end) throw Error('invalid DER length'); n = 0; for (let i = 0; i < count; i++) n = n * 256 + b[p++]; }
    if (p + n > end) throw Error('truncated DER value');
    return { tag, start: p, end: p + n };
  }
  function derChildren(b, node) {
    const list = []; let p = node.start;
    while (p < node.end) { const c = derNode(b, p, node.end); list.push(c); p = c.end; if (list.length > 1000) throw Error('DER item limit'); }
    return list;
  }
  function certificateSubject(b) {
    const root = derNode(b, 0, b.length), cert = derChildren(b, root);
    if (root.tag !== 48 || !cert[0]) throw Error('invalid certificate');
    const tbs = derChildren(b, cert[0]);
    const offset = tbs[0] && tbs[0].tag === 160 ? 1 : 0;
    const subject = tbs[offset + 4];
    if (!subject || subject.tag !== 48) throw Error('missing certificate subject');
    const out = { organization: '', commonName: '' };
    for (const set of derChildren(b, subject)) for (const seq of derChildren(b, set)) {
      const pair = derChildren(b, seq); if (pair.length < 2) continue;
      const oid = b.subarray(pair[0].start, pair[0].end);
      if (oid.length !== 3 || oid[0] !== 85 || oid[1] !== 4) continue;
      const val = b.subarray(pair[1].start, pair[1].end);
      let s = '';
      if (pair[1].tag === 30) for (let i = 0; i + 1 < val.length; i += 2) s += String.fromCharCode(val[i] * 256 + val[i + 1]);
      else s = pair[1].tag === 12 ? text(val) : latin.decode(val);
      if (oid[2] === 10) out.organization = s;
      if (oid[2] === 3) out.commonName = s;
    }
    return out;
  }

  function boxes(b, start = 0, end = b.length, depth = 0, budget = { n: 0 }) {
    if (depth > 32) throw Error('JUMBF nesting limit');
    const out = []; let p = start;
    while (p < end) {
      if (++budget.n > 10000) throw Error('JUMBF box limit');
      if (p + 8 > end) throw Error('truncated JUMBF box header');
      let n = u32(b, p), h = 8; const type = ascii(b, p + 4, 4);
      if (n === 1) { if (p + 16 > end) throw Error('truncated extended box'); n = u32(b, p + 8) * 4294967296 + u32(b, p + 12); h = 16; }
      if (n === 0) n = end - p;
      if (!Number.isSafeInteger(n) || n < h || p + n > end) throw Error('truncated or invalid JUMBF box length');
      const node = { type, data: b.subarray(p + h, p + n), children: [], label: '' };
      if (type === 'jumb') {
        node.children = boxes(b, p + h, p + n, depth + 1, budget);
        const desc = node.children.find(c => c.type === 'jumd');
        if (desc && desc.data.length >= 17 && (desc.data[16] & 1)) {
          const z = desc.data.indexOf(0, 17); if (z < 0) throw Error('unterminated JUMBF label');
          node.label = text(desc.data.subarray(17, z));
        }
      }
      out.push(node); p += n;
    }
    return out;
  }
  function flatten(nodes) { const out = []; for (const n of nodes) { out.push(n); out.push(...flatten(n.children)); } return out; }
  function parseManifest(b) {
    const tree = boxes(b), store = flatten(tree).find(n => n.type === 'jumb' && n.label === 'c2pa');
    if (!store) throw Error('missing c2pa manifest store');
    const manifests = store.children.filter(n => n.type === 'jumb');
    const active = manifests[manifests.length - 1];
    if (!active) throw Error('empty manifest store');
    const nodes = flatten(active.children);
    const claimBox = nodes.find(n => /^c2pa\.claim(?:\.v\d+)?$/.test(n.label));
    const payload = claimBox && claimBox.children.find(n => n.type === 'cbor');
    if (!payload) throw Error('missing claim CBOR');
    const claim = decodeCBOR(payload.data);
    const info = claim.claim_generator_info;
    const names = (Array.isArray(info) ? info : info ? [info] : []).map(i => i.name).filter(Boolean);
    const value = { manifest: active.label, generator: claim.claim_generator || names.join(', '), signer: { organization: '', commonName: '' }, signature: claim.signature || '', actions: [], ingredients: 0, sourceTypes: [] };
    const assertions = active.children.find(n => n.label === 'c2pa.assertions');
    for (const assertion of assertions ? assertions.children : []) {
      if (/^c2pa\.ingredient(?:[._]|$)/.test(assertion.label)) value.ingredients++;
      if (/^c2pa\.actions(?:\.v2)?(?:__\d+)?$/.test(assertion.label)) {
        const cb = assertion.children.find(n => n.type === 'cbor');
        if (!cb) throw Error('missing actions CBOR');
        const data = decodeCBOR(cb.data);
        for (const a of data.actions || []) value.actions.push({ action: String(a.action || ''), digitalSourceType: String(a.digitalSourceType || '') });
      }
    }
    value.sourceTypes = [...new Set(value.actions.map(a => a.digitalSourceType).filter(Boolean))];
    const sigLabel = String(value.signature).split('/').pop();
    const sigBox = active.children.find(n => n.label === sigLabel) || active.children.find(n => n.label === 'c2pa.signature');
    if (!sigBox) throw Error('missing signature box');
    const sig = sigBox.children.find(n => n.type === 'cbor');
    if (!sig) throw Error('missing signature CBOR');
    const cose = decodeCBOR(sig.data);
    if (!Array.isArray(cose) || cose.length !== 4) throw Error('invalid COSE_Sign1');
    const protectedHeader = cose[0] instanceof Uint8Array && cose[0].length ? decodeCBOR(cose[0]) : {};
    const unprotectedHeader = cose[1] || {};
    const chain = protectedHeader['33'] || protectedHeader.x5chain || unprotectedHeader['33'] || unprotectedHeader.x5chain;
    const cert = Array.isArray(chain) ? chain[0] : chain;
    if (cert instanceof Uint8Array) value.signer = certificateSubject(cert);
    return value;
  }

  // Synchronous RFC 1950/1951 inflate keeps inspect() pure in either runtime.
  function inflateZlib(b) {
    if (b.length < 6 || (b[0] & 15) !== 8 || ((b[0] << 8) + b[1]) % 31 || (b[1] & 32)) throw Error('invalid zlib header');
    let bit = 16, used = 0;
    const out = new Uint8Array(LIMIT);
    function bits(n) { let v = 0; for (let i = 0; i < n; i++) { if (bit >= (b.length - 4) * 8) throw Error('truncated deflate'); v |= ((b[bit >> 3] >> (bit & 7)) & 1) << i; bit++; } return v; }
    function table(lengths) {
      const count = Array(16).fill(0), next = Array(16).fill(0), map = new Map(); let code = 0;
      for (const n of lengths) { if (n < 0 || n > 15) throw Error('invalid Huffman length'); if (n) count[n]++; }
      for (let n = 1; n <= 15; n++) { code = (code + count[n - 1]) << 1; next[n] = code; if (code + count[n] > 1 << n) throw Error('oversubscribed Huffman tree'); }
      lengths.forEach((n, symbol) => { if (n) { let c = next[n]++, r = 0; for (let i = 0; i < n; i++) { r = (r << 1) | (c & 1); c >>= 1; } map.set((1 << n) + r, symbol); } });
      return map;
    }
    function symbol(t) { let c = 0; for (let n = 1; n <= 15; n++) { c |= bits(1) << (n - 1); const v = t.get((1 << n) + c); if (v !== undefined) return v; } throw Error('invalid Huffman code'); }
    function put(v) { if (used === LIMIT) throw Error('compressed metadata exceeds 4 MB limit'); out[used++] = v; }
    const lb = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
    const le = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    const db = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
    const de = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    let final;
    do {
      final = bits(1); const type = bits(2);
      if (type === 0) { bit = (bit + 7) & ~7; const n = bits(16); if ((n ^ bits(16)) !== 65535) throw Error('invalid stored block'); for (let i = 0; i < n; i++) put(bits(8)); continue; }
      let lits, dists;
      if (type === 1) { lits = table(Array.from({ length: 288 }, (_, i) => i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)); dists = table(Array(32).fill(5)); }
      else if (type === 2) {
        const nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4;
        const codeOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
        const lengths = Array(19).fill(0); for (let i = 0; i < nc; i++) lengths[codeOrder[i]] = bits(3);
        const ct = table(lengths), all = [];
        while (all.length < nl + nd) { const s = symbol(ct); if (s < 16) all.push(s); else { if (s === 16 && !all.length) throw Error('invalid repeated code length'); const n = s === 16 ? bits(2) + 3 : s === 17 ? bits(3) + 3 : bits(7) + 11; const v = s === 16 ? all[all.length - 1] : 0; if (all.length + n > nl + nd) throw Error('excess code lengths'); for (let i = 0; i < n; i++) all.push(v); } }
        if (!all[256]) throw Error('missing end-of-block code'); lits = table(all.slice(0, nl)); dists = table(all.slice(nl));
      } else throw Error('reserved deflate block');
      while (true) { const s = symbol(lits); if (s === 256) break; if (s < 256) { put(s); continue; } if (s > 285) throw Error('invalid length code'); const n = lb[s - 257] + bits(le[s - 257]), d = symbol(dists); if (d > 29) throw Error('invalid distance code'); const dist = db[d] + bits(de[d]); if (dist > used) throw Error('deflate distance before output'); for (let i = 0; i < n; i++) put(out[used - dist]); }
    } while (!final);
    let a = 1, c = 0; for (let i = 0; i < used; i++) { a = (a + out[i]) % 65521; c = (c + a) % 65521; }
    if (((c * 65536 + a) >>> 0) !== u32(b, b.length - 4)) throw Error('invalid zlib checksum');
    return out.slice(0, used);
  }

  function jpegSegments(b) {
    const out = []; let p = 2;
    while (p + 2 <= b.length && b[p] === 255) {
      while (b[p + 1] === 255) p++;
      const m = b[p + 1]; if (m === 217 || m === 218) break;
      if (m === 1 || (m >= 208 && m <= 215)) { p += 2; continue; }
      if (p + 4 > b.length) break;
      const n = view(b).getUint16(p + 2); if (n < 2) break;
      out.push({ marker: m, data: b.subarray(p + 4, Math.min(p + 2 + n, b.length)), truncated: p + 2 + n > b.length }); p += 2 + n;
    }
    return out;
  }
  function exif(b, add) {
    if (ascii(b, 0, 6) === 'Exif\0\0') b = b.subarray(6);
    if (b.length < 8) return;
    const dv = view(b), le = ascii(b, 0, 2) === 'II';
    if ((!le && ascii(b, 0, 2) !== 'MM') || dv.getUint16(2, le) !== 42) return;
    const ifd = dv.getUint32(4, le); if (ifd + 2 > b.length) return;
    const n = dv.getUint16(ifd, le);
    for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= b.length; i++) {
      const p = ifd + 2 + i * 12, tag = dv.getUint16(p, le), type = dv.getUint16(p + 2, le), count = dv.getUint32(p + 4, le);
      if (type !== 2 || (tag !== 305 && tag !== 270)) continue;
      const q = count <= 4 ? p + 8 : dv.getUint32(p + 8, le);
      if (q + count > b.length || count > LIMIT) continue;
      add('exif', tag === 305 ? 'Software' : 'ImageDescription', latin.decode(b.subarray(q, q + count)).replace(/\0.*$/s, ''));
    }
  }
  function xmlValue(s) { return s.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi, e => { const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }; if (named[e]) return named[e]; const n = e[2].toLowerCase() === 'x' ? parseInt(e.slice(3, -1), 16) : parseInt(e.slice(2, -1), 10); return n <= 1114111 ? String.fromCodePoint(n) : e; }); }
  function readXMP(b) {
    const values = [], creators = []; let p = 0, packets = 0;
    while (packets++ < 100) {
      const q = find(b, '<x:xmpmeta', p); if (q < 0) break;
      const end = find(b, '</x:xmpmeta>', q); p = end < 0 ? q + 10 : end + 12;
      if (end < 0 || end - q > LIMIT) continue;
      const s = text(b.subarray(q, end + 12));
      for (const [name, dest] of [['Iptc4xmpExt:DigitalSourceType', values], ['xmp:CreatorTool', creators]]) {
        const attr = new RegExp(name + '\\s*=\\s*(["\'])(.*?)\\1', 'gs');
        const elem = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '\\s*>', 'g');
        let m; while ((m = attr.exec(s))) dest.push(xmlValue(m[2].trim()));
        while ((m = elem.exec(s))) dest.push(xmlValue(m[1].replace(/<[^>]*>/g, '').trim()));
      }
    }
    return { digitalSourceTypes: [...new Set(values)], creatorTool: [...new Set(creators)].join(', ') };
  }

  function decide(signals) {
    const c = signals.find(s => s.source === 'c2pa'), x = signals.find(s => s.source === 'xmp');
    const cv = c && c.value || {}, xv = x && x.value || {};
    const ct = (cv.sourceTypes || []).map(term), xt = (xv.digitalSourceTypes || []).map(term);
    const ai = ts => ts.some(t => t === 'trainedAlgorithmicMedia' || t === 'compositeWithTrainedAlgorithmicMedia');
    if ((ai(ct) && xt.includes('digitalCapture')) || (ai(xt) && ct.includes('digitalCapture'))) return 'conflict';
    if ((cv.actions || []).some(a => a.action === 'c2pa.created' && term(a.digitalSourceType) === 'trainedAlgorithmicMedia') || xt.includes('trainedAlgorithmicMedia')) return 'ai_generated';
    if (ct.includes('compositeWithTrainedAlgorithmicMedia') || xt.includes('compositeWithTrainedAlgorithmicMedia')) return 'ai_edited';
    if (ct.includes('digitalCapture') && !ai(ct) && !ai(xt)) return 'camera_signed';
    if (c && c.found) return 'credentials_no_ai_claim';
    if (signals.some(s => s.source === 'meta' && s.found && s.aiHint)) return 'ai_hint';
    return 'no_labels';
  }
  function finish(filename, format, signals, notes) {
    const verdict = decide(signals);
    if (verdict === 'no_labels') notes.push(noLabels);
    return { filename, format, verdict, headline: headlines[verdict], signals, notes, watermarkLinks: watermarkLinks.map(l => ({ ...l })), creatorNote: /^ai_(generated|edited|hint)$/.test(verdict) ? creatorNote.map(l => ({ ...l })) : [] };
  }
  function inspect(input, filename = '') {
    let b; try { b = input instanceof Uint8Array ? input : new Uint8Array(input); } catch (_) { b = new Uint8Array(); }
    let format = 'unknown', stores = [], present = false, unsupported = false, storeError = '', meta = [];
    const notes = [];
    function add(kind, key, raw) {
      raw = String(raw); const aiHint = /^(parameters|prompt|workflow)$/.test(key) || aiPattern.test(raw);
      const value = raw.slice(0, 200);
      const base = 'meta:' + kind + ':' + key;
      const count = meta.filter(s => s.id === base || s.id.startsWith(base + ':')).length;
      const s = signal(base + (count ? ':' + (count + 1) : ''), 'meta', true, value, key + ': ' + value + (raw.length > 200 ? '... (truncated to 200 characters)' : '') + (aiHint ? ' — AI tool hint, not a formal label' : ' — plain metadata'), 'hint'); s.aiHint = aiHint; meta.push(s);
    }
    try {
      if (b[0] === 255 && b[1] === 216) {
        format = 'jpeg'; const groups = new Map();
        for (const seg of jpegSegments(b)) {
          if (seg.marker === 225) { try { exif(seg.data, add); } catch (_) { notes.push('EXIF metadata could not be fully parsed.'); } }
          if (seg.marker !== 235 || ascii(seg.data, 0, 2) !== 'JP' || seg.data.length < 16 || ascii(seg.data, 12, 4) !== 'jumb') continue;
          present = true; const en = view(seg.data).getUint16(2), seq = u32(seg.data, 4);
          if (!groups.has(en)) groups.set(en, []);
          groups.get(en).push({ seq, data: seg.data.subarray(seq === 1 ? 8 : 16), truncated: seg.truncated });
        }
        for (const parts of groups.values()) {
          parts.sort((a, b) => a.seq - b.seq);
          if (parts.some((p, i) => p.seq !== i + 1 || p.truncated)) throw Error('missing or truncated JPEG JUMBF packet');
          stores.push(concat(parts.map(p => p.data)));
        }
      } else if (ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n') {
        format = 'png'; let p = 8;
        while (p + 8 <= b.length) {
          const n = u32(b, p), kind = ascii(b, p + 4, 4), d = b.subarray(p + 8, Math.min(p + 8 + n, b.length));
          if (kind === 'caBX') { present = true; stores.push(d); }
          if (p + n + 12 > b.length) { if (kind === 'caBX') storeError = 'truncated PNG manifest chunk'; break; }
          try {
            if (kind === 'eXIf') exif(d, add);
            if (['tEXt','iTXt','zTXt'].includes(kind)) {
              const z = d.indexOf(0); if (z < 0) throw Error('missing PNG keyword'); const key = latin.decode(d.subarray(0, z));
              if (['parameters','prompt','workflow','Software','Comment','Description'].includes(key)) {
                let raw;
                if (kind === 'tEXt') raw = latin.decode(d.subarray(z + 1, Math.min(d.length, z + 1 + LIMIT)));
                else if (kind === 'zTXt') { if (d[z + 1] !== 0) throw Error('unsupported PNG compression'); raw = latin.decode(inflateZlib(d.subarray(z + 2))); }
                else { const compressed = d[z + 1], method = d[z + 2]; let q = d.indexOf(0, z + 3); if (q < 0) throw Error('invalid iTXt language'); q = d.indexOf(0, q + 1); if (q < 0 || method !== 0 || compressed > 1) throw Error('invalid iTXt header'); raw = text(compressed ? inflateZlib(d.subarray(q + 1)) : d.subarray(q + 1, q + 1 + LIMIT)); }
                add('png', key, raw);
              }
            }
          } catch (e) { notes.push(kind + ' metadata could not be parsed: ' + e.message); }
          p += n + 12;
        }
      } else if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
        format = 'webp'; let p = 12;
        while (p + 8 <= b.length) { const kind = ascii(b, p, 4), n = view(b).getUint32(p + 4, true), d = b.subarray(p + 8, Math.min(p + 8 + n, b.length)); if (kind === 'C2PA') { present = true; stores.push(d); if (p + 8 + n > b.length) storeError = 'truncated WebP manifest chunk'; } if (kind === 'EXIF') { try { exif(d, add); } catch (_) { notes.push('EXIF metadata could not be fully parsed.'); } } p += 8 + n + (n & 1); }
      } else if (ascii(b, 4, 4) === 'ftyp' || /\.(mp4|mov|m4a|heic|heif|avif)$/i.test(filename)) {
        format = 'bmff'; let p = 0;
        while (p + 8 <= b.length) {
          let n = u32(b, p), h = 8; const kind = ascii(b, p + 4, 4);
          if (n === 1) { if (p + 16 > b.length) break; n = u32(b, p + 8) * 4294967296 + u32(b, p + 12); h = 16; } if (!n) n = b.length - p;
          if (!Number.isSafeInteger(n) || n < h) break;
          if (kind === 'uuid' && ascii(b, p + h, 16) === '\xd8\xfe\xc3\xd6\x1b\x0e\x48\x3c\x92\x97\x58\x28\x87\x7e\xc4\x81') {
            present = true; const end = Math.min(p + n, b.length), q = find(b.subarray(p + h + 16, end), 'jumb');
            if (q >= 4) stores.push(b.subarray(p + h + 16 + q - 4, end)); else storeError = 'missing BMFF manifest store';
            if (p + n > b.length) storeError = 'truncated BMFF manifest box';
          }
          if (p + n > b.length) break; p += n;
        }
      }
    } catch (e) { storeError = e.message; }
    // Also finds unsupported embeddings, including a sampled file's tail.
    if (!present) {
      let p = 0, attempts = 0;
      while (attempts++ < 1000) { const q = find(b, 'jumb', p); if (q < 0) break; p = q + 4; if (q < 4) continue;
        const n = u32(b, q - 4), near = b.subarray(q + 4, Math.min(q + 260, b.length));
        if (find(near, 'c2pa\0') >= 0 && find(near, 'jumd') >= 0) { present = true; unsupported = format === 'unknown'; stores.push(b.subarray(q - 4, n >= 8 ? Math.min(q - 4 + n, b.length) : b.length)); break; }
      }
    }
    let value = null, detail = 'Content Credentials not found. Signature not checked here.';
    if (present) {
      try { if (storeError) throw Error(storeError); if (!stores.length) throw Error('missing manifest bytes'); for (const store of stores) value = parseManifest(store); detail = (unsupported ? 'Content Credentials found but this file type is not fully parsed. ' : '') + 'Generator: ' + (value.generator || 'not specified') + '; signer organization: ' + (value.signer.organization || 'not specified') + '; signer CN: ' + (value.signer.commonName || 'not specified') + '; actions: ' + value.actions.map(a => a.action + (a.digitalSourceType ? ' (' + (sourceNames[term(a.digitalSourceType)] || term(a.digitalSourceType)) + ')' : '')).join(', ') + '; ingredients: ' + value.ingredients + '. Signature not checked here.'; }
      catch (e) { value = null; detail = (unsupported ? 'Content Credentials found but this file type is not fully parsed. ' : '') + 'Content Credentials present but could not be parsed: ' + e.message + '. Signature not checked here.'; }
    }
    const c = signal('c2pa', 'c2pa', present, value, detail); c.verifyUrl = 'https://contentcredentials.org/verify';
    let x = { digitalSourceTypes: [], creatorTool: '' }; try { x = readXMP(b); } catch (e) { notes.push('XMP could not be parsed: ' + e.message); }
    const hasX = !!(x.digitalSourceTypes.length || x.creatorTool);
    const xs = signal('xmp', 'xmp', hasX, hasX ? x : null, hasX ? 'Digital source type: ' + (x.digitalSourceTypes.map(s => (sourceNames[term(s)] || term(s)) + ' (' + s + ')').join(', ') || 'not specified') + '; creator tool: ' + (x.creatorTool || 'not specified') : 'IPTC/XMP provenance fields not found.');
    if (!meta.length) meta.push(signal('meta', 'meta', false, null, 'Generator metadata not found.', 'hint'));
    return finish(String(filename), format, [c, xs, ...meta, signal('watermark', 'watermark', null, null, "Invisible watermarks such as Google SynthID can't be read offline. No public Google SynthID Detector API is documented.", 'hint')], notes);
  }
  function inspectParts(head, tail, filename) {
    const a = inspect(head, filename), b = inspect(tail, filename), merged = new Map();
    for (const s of a.signals) merged.set(s.id, s);
    for (const s of b.signals) if (s.found && (!merged.has(s.id) || !merged.get(s.id).found || (s.id === 'c2pa' && s.value))) merged.set(s.id, s);
    const signals = [...merged.values()];
    if (signals.some(s => s.source === 'meta' && s.found)) { const i = signals.findIndex(s => s.id === 'meta'); if (i >= 0) signals.splice(i, 1); }
    const notes = [...new Set([...a.notes, ...b.notes].filter(s => s !== noLabels))];
    notes.unshift('Partial scan: only the first and last 64 MB were read because this file exceeds 1 GB. Labels in the middle, and split manifests, may be missed.');
    return finish(filename, a.format, signals, notes);
  }
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  function compare(a, b) {
    const before = new Map(a.signals.map(s => [s.id, s])), after = new Map(b.signals.map(s => [s.id, s]));
    const entries = []; let total = 0, stripped = 0;
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const x = before.get(id), y = after.get(id), xf = !!(x && x.found), yf = !!(y && y.found);
      if (xf) total++;
      const unknown = (x ? x.found === null : true) && (y ? y.found === null : true);
      const status = unknown ? 'unknown' : xf && !yf ? 'stripped' : !xf && yf ? 'added' : !xf && !yf ? 'absent' : stable(x.value) === stable(y.value) ? 'kept' : 'changed';
      if (status === 'stripped') stripped++;
      entries.push({ id, source: (x || y).source, status, before: x ? x.value : null, after: y ? y.value : null,
        beforeDetail: xf ? x.detail : null, afterDetail: yf ? y.detail : null });
    }
    return { entries, total, stripped, summary: stripped + ' of ' + total + ' labels were stripped' };
  }
  return { inspect, inspectParts, compare, decodeCBOR, certificateSubject, inflateZlib };
}));

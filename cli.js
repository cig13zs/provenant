#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { inspect, compare } = require('./provenance');
const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter(a => a !== '--json');
function usage() {
  console.error('Usage: node cli.js <file...> [--json]\n       node cli.js compare <before> <after> [--json]');
  process.exitCode = 2;
}
function read(file) {
  try { return inspect(fs.readFileSync(file), file); }
  catch (e) { return { filename: file, error: "Couldn't read this file: " + e.message }; }
}
function printReport(r) {
  console.log(r.filename + '\n' + (r.error || r.headline));
  if (r.error) return;
  for (const s of r.signals) console.log('  ' + s.source + ' [' + (s.found === null ? "can't check" : s.found ? 'found' : 'not found') + ']: ' + s.detail);
  const c = r.signals.find(s => s.source === 'c2pa');
  if (c.found) console.log('  Check signature: ' + c.verifyUrl);
  for (const n of r.notes) console.log(n);
  for (const l of r.watermarkLinks) console.log('  ' + l.label + ': ' + l.url);
  if (r.creatorNote.length) {
    console.log('Posting this?');
    for (const n of r.creatorNote) console.log('  ' + n.platform + ': ' + n.text + '\n  ' + n.url);
  }
}
if (!files.length || files.some(a => a.startsWith('--')) || (files[0] === 'compare' && files.length !== 3)) usage();
else if (files[0] === 'compare') {
  const a = read(files[1]), b = read(files[2]);
  if (a.error || b.error) { if (json) console.log(JSON.stringify({ before: a, after: b }, null, 2)); else { if (a.error) printReport(a); if (b.error) printReport(b); } }
  else {
    const diff = compare(a, b);
    if (json) console.log(JSON.stringify(diff, null, 2));
    else {
      console.log(diff.summary);
      console.log('Signal\tStatus\tBefore\tAfter');
      for (const e of diff.entries) console.log([e.id, e.status, e.beforeDetail || '-', e.afterDetail || '-'].join('\t'));
      console.log('absent = neither file had it. Invisible watermarks stay unknown: they cannot be checked offline.');
    }
  }
} else {
  const reports = files.map(read);
  if (json) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  else reports.forEach((r, i) => { if (i) console.log(); printReport(r); });
}

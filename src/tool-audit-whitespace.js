// Compare RAW source strings (no trim, no collapse) against what the parser stored,
// so we can see every place whitespace was altered.
const fs = require('fs');
const path = require('path');

const SP = __dirname;
const xml = fs.readFileSync(path.join(SP, 'quiz', 'word', 'document.xml'), 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
const raw = [];
const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
let pm;
while ((pm = pRe.exec(body)) !== null) {
  let t = '';
  const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let tm;
  while ((tm = tRe.exec(pm[0])) !== null) t += dec(tm[1]);
  raw.push(t);           // deliberately NOT trimmed
}

const show = s => JSON.stringify(s)
  .replace(/\\u00a0/g, '<NBSP>')
  .replace(/\\t/g, '<TAB>');

let findings = { lead: [], trail: [], dbl: [], nbsp: [], tab: [] };
for (const line of raw) {
  if (!line.trim()) continue;
  if (/^[  \t]+/.test(line)) findings.lead.push(line);
  if (/[  \t]+$/.test(line)) findings.trail.push(line);
  if (/[^\S\r\n]{2,}/.test(line)) findings.dbl.push(line);
  if (/ /.test(line)) findings.nbsp.push(line);
  if (/\t/.test(line)) findings.tab.push(line);
}

for (const [k, label] of [['lead', 'leading whitespace'], ['trail', 'trailing whitespace'],
                          ['dbl', 'double (or more) internal spaces'],
                          ['nbsp', 'non-breaking spaces'], ['tab', 'tabs']]) {
  const v = findings[k];
  console.log(`\n=== ${label}: ${v.length} paragraph(s) ===`);
  v.slice(0, 12).forEach(l => console.log('   ' + show(l).slice(0, 150)));
  if (v.length > 12) console.log(`   ... and ${v.length - 12} more`);
}

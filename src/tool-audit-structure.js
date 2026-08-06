// Does any option or feedback in the SOURCE span more than one paragraph,
// or is any blank paragraph sitting inside a question block?
const fs = require('fs');
const path = require('path');

const SP = __dirname;
const xml = fs.readFileSync(path.join(SP, 'quiz', 'word', 'document.xml'), 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
const paras = [];
const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
let pm;
while ((pm = pRe.exec(body)) !== null) {
  let t = '';
  const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let tm;
  while ((tm = tRe.exec(pm[0])) !== null) t += dec(tm[1]);
  paras.push(t.replace(/ /g, ' ').trim());
}

const qIdx = [];
paras.forEach((p, i) => { if (/^Question \d+\s+\|/.test(p)) qIdx.push(i); });

let multiOpt = 0, multiFb = 0, blanksInside = 0;
const samples = [];

qIdx.forEach((s, k) => {
  const e = k + 1 < qIdx.length ? qIdx[k + 1] : paras.length;
  const blk = paras.slice(s, e);

  // classify each non-empty line
  const kinds = blk.map(l =>
    /^Question \d+\s+\|/.test(l) ? 'H'
    : /^[A-Z]\.\s/.test(l) ? 'O'
    : /^(✅\s*)?Correct Answer:/.test(l) ? 'K'
    : /^Feedback:\s*$/.test(l) ? 'FH'
    : /^[A-Z]:\s/.test(l) ? 'F'
    : l === '' ? '_'
    : 'X');   // X = continuation of whatever came before

  // blank line strictly inside the block (not the trailing separator)
  const lastReal = kinds.map((x, i) => x !== '_' ? i : -1).reduce((a, b) => Math.max(a, b), -1);
  kinds.slice(0, lastReal).forEach(x => { if (x === '_') blanksInside++; });

  kinds.forEach((x, i) => {
    if (x !== 'X') return;
    const prev = kinds.slice(0, i).reverse().find(y => y !== '_' && y !== 'X');
    if (prev === 'O') { multiOpt++; if (samples.length < 8) samples.push(['OPTION cont.', blk[i]]); }
    else if (prev === 'F') { multiFb++; if (samples.length < 8) samples.push(['FEEDBACK cont.', blk[i]]); }
  });
});

console.log('questions scanned:                 ' + qIdx.length);
console.log('options spanning >1 paragraph:     ' + multiOpt);
console.log('feedbacks spanning >1 paragraph:   ' + multiFb);
console.log('blank paragraphs inside a block:   ' + blanksInside);
if (samples.length) {
  console.log('\nsamples:');
  samples.forEach(([k, t]) => console.log('  [' + k + '] ' + JSON.stringify(t.slice(0, 110))));
}

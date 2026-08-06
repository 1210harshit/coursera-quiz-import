// Structural scan of the GenAI quiz: split into blocks and report what each contains.
const fs = require('fs');
const path = require('path');

const SP = __dirname;
const xml = fs.readFileSync(path.join(SP, 'genai-marketing', 'quiz', 'word', 'document.xml'), 'utf8');
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
  const numbered = /<w:numPr>/.test(pm[0]);
  paras.push({ t: t.replace(/ /g, ' ').trim(), bullet: numbered });
}

// module boundaries
const modAt = [];
paras.forEach((p, i) => { const m = p.t.match(/^Module\s+(\d+)\s*$/); if (m) modAt.push({ i, n: +m[1] }); });

// question starts = "Correct Answer:" anchors, walk back to collect
const answers = [];
paras.forEach((p, i) => { if (/^Correct Answer:\s*[A-D]\s*$/.test(p.t)) answers.push(i); });

console.log('modules at paragraph:', modAt.map(m => `M${m.n}@${m.i}`).join(' '));
console.log('“Correct Answer:” anchors:', answers.length);

let prevEnd = 0;
const report = [];
answers.forEach((a, k) => {
  const nextA = k + 1 < answers.length ? answers[k + 1] : paras.length;
  // block = from previous end to this answer, plus trailing explanation region
  const start = prevEnd;
  let end = nextA;
  // trailing region ends at the separator or next question's first bullet
  const blk = paras.slice(start, end);
  prevEnd = end;

  const bullets = blk.filter(p => p.bullet && p.t).length;
  const has = s => blk.some(p => new RegExp(s, 'i').test(p.t));
  const mod = modAt.filter(m => m.i <= a).slice(-1)[0];
  report.push({
    q: k + 1,
    mod: mod ? mod.n : '?',
    bullets,
    key: (paras[a].t.match(/([A-D])/) || [])[1],
    corrExpl: has('^(Correct Answer Explanation|Explanation):'),
    incHdr: has('^Explanations for Incorrect Options'),
    mapped: (blk.map(p => (p.t.match(/^Mapped\s+To:\s*(\S+)/i) || [])[1]).filter(Boolean)[0]) || null,
  });
});

console.log('\n q# mod bullets key corrExpl incHdr mapped');
report.forEach(r => {
  const flag = (!r.corrExpl || !r.incHdr || !r.mapped || r.bullets !== 5) ? '  <-- CHECK' : '';
  console.log(` ${String(r.q).padStart(2)}  M${r.mod}   ${r.bullets}     ${r.key}    ${String(r.corrExpl).padEnd(5)}   ${String(r.incHdr).padEnd(5)}  ${String(r.mapped).padEnd(8)}${flag}`);
});

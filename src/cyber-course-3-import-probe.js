// DIAGNOSTIC, not production. Builds ONE document whose ten questions each encode the question
// block DIFFERENTLY, so a single upload identifies what Coursera's importer rejects with
// "content could not be processed".
//
//     node src/cyber-course-3-import-probe.js [distDir] [outDir]
//
// WHY THIS EXISTS. Cybersecurity Course 3's thirteen documents verify clean, carry none of the
// hostile shapes recorded in SETUP §7, and are byte-identical to the delivered Cybersecurity
// Course 1 set in every part of the .docx package except word/document.xml — whose element
// tally differs only by the four extra paragraphs of a longer objectives list. Coursera
// nonetheless refuses one with a message that names nothing. Static comparison has run out of
// hypotheses, and guessing costs an upload per guess. This costs one upload.
//
// THE CONTROL IS A REAL QUESTION, NOT A RECONSTRUCTION. The first version of this script
// hand-wrote its paragraphs and got two details wrong that would have invalidated the whole
// experiment: it set the font to Open Sans where the builder uses Source Sans Pro, and wrote
// blank paragraphs as <w:p/> where the builder emits a full <w:p><w:pPr><w:rPr>…. A control
// that differs from production is not a control. So every variant here is produced by CLONING
// question 1's actual paragraphs out of a built document and changing only the one thing under
// test — formatting, fonts, spacing and paragraph properties stay byte-identical to what ships.
//
// Every prompt is prefixed [P<n>] naming its variant. Upload the file, then read off which
// questions arrived. A variant that imports exonerates its shape; the one that does not is the
// answer. P1 is production itself: if P1 fails and the others do too, the fault is not in the
// question grammar at all and the Guide Section or the package is next.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const SRC = process.argv[2] || path.join(__dirname, '..', 'work', 'cyber-course-3', 'dist');
const OUT = process.argv[3] || path.join(__dirname, '..', 'work', 'cyber-course-3', 'probe');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textOf = p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

// Replace a cloned paragraph's text while keeping its pPr and its first run's rPr. Later runs
// are dropped, which is what makes a multi-run reference paragraph collapse to one run without
// changing a single formatting attribute.
function setText(para, text) {
  const runs = para.match(/<w:r\b(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g) || [];
  if (!runs.length) return para;
  let first = runs[0].replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/, `$1${esc(text)}$2`);
  if (!/<w:t/.test(first)) first = first.replace(/<\/w:r>$/, `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`);
  let out = para.replace(runs[0], '\u0000FIRST\u0000');
  for (const r of runs.slice(1)) out = out.replace(r, '');
  return out.replace('\u0000FIRST\u0000', first);
}

const file = path.join(SRC, 'Coursera_Import_Module_1_Graded_Quiz_Cybersecurity_Course_3.docx');
if (!fs.existsSync(file)) {
  console.error(`ENOENT ${file}\nBuild the graded set first:\n`
    + '    node src/cyber-course-3-build.js work/cyber-course-3/dist');
  process.exit(1);
}

const ex = path.join(OUT, '_x');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
execFileSync('unzip', ['-o', '-q', file, '-d', ex]);
const docPath = path.join(ex, 'word', 'document.xml');
const xml = fs.readFileSync(docPath, 'utf8');

const paraRe = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const paras = xml.match(paraRe) || [];
const si = paras.findIndex(p => /Importable content starts here/i.test(textOf(p)));
const ei = paras.findIndex(p => /End of importable content|Importable content ends here/i.test(textOf(p)));
if (si < 0 || ei < 0 || ei <= si) {
  console.error('could not locate the importable section');
  process.exit(1);
}
const section = paras.slice(si + 1, ei);

// Question 1's block: its header through the paragraph before question 2's header.
const isQ = p => /^Question\s+\d+\s*-/i.test(textOf(p).trim());
const qStart = section.findIndex(isQ);
const qEnd = section.findIndex((p, i) => i > qStart && isQ(p));
const block = section.slice(qStart, qEnd < 0 ? section.length : qEnd);

// Classify the block's paragraphs so a variant can address them by role.
const role = p => {
  const t = textOf(p).trim();
  if (!t) return 'blank';
  if (isQ(p)) return 'qhead';
  if (/^\*?[A-F]\s*[:.]\s+\S/.test(t)) return 'option';
  if (/^Feedback\s*:/i.test(t)) return 'feedback';
  if (/^Refer to\s/i.test(t)) return 'refer';
  return 'prompt';
};
const roles = block.map(role);
const pick = r => block[roles.indexOf(r)];
const TPL = {
  qhead: pick('qhead'), prompt: pick('prompt'), blank: pick('blank'),
  option: pick('option'), feedback: pick('feedback'), refer: pick('refer'),
};
for (const [k, v] of Object.entries(TPL)) {
  if (!v) { console.error(`question 1 has no ${k} paragraph to clone`); process.exit(1); }
}

// The content every variant carries, read out of the real question so nothing is invented.
const OPTS = block
  .map((p, i) => ({ p, i }))
  .filter(({ i }) => roles[i] === 'option')
  .map(({ p, i }) => {
    const t = textOf(p).trim();
    const star = t.startsWith('*');
    const letter = /^\*?\s*([A-F])/.exec(t)[1];
    const body = t.replace(/^\*?\s*[A-F]\s*[:.]\s*/, '');
    const fbAt = roles.indexOf('feedback', i);
    const refAt = roles.indexOf('refer', i);
    return {
      star, letter, body,
      fb: fbAt >= 0 ? textOf(block[fbAt]).trim().replace(/^Feedback\s*:\s*/i, '') : '',
      ref: refAt >= 0 ? textOf(block[refAt]).trim() : '',
    };
  });
const PROMPT = textOf(pick('prompt')).trim();
const PROMPT2 = 'The next shift has to be briefed either way.';

const Q = (n, kind) => setText(TPL.qhead, `Question ${n} - ${kind}`);
const OPT = (o, sep) => setText(TPL.option, `${o.star ? '*' : ''}${o.letter}${sep} ${o.body}`);
const FB = (o, verdict) => setText(TPL.feedback,
  `Feedback: ${verdict ? (o.star ? 'Correct. ' : 'Incorrect. ') : ''}${o.fb}`);
const REF = o => setText(TPL.refer, o.ref);
const PR = (n, extra) => {
  const out = [setText(TPL.prompt, `[P${n}] ${PROMPT}`)];
  if (extra) out.push(setText(TPL.prompt, PROMPT2));
  return out;
};
const B = () => TPL.blank;

const VARIANTS = [
  { name: 'control — question 1 exactly as it ships',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o), REF(o), B()])] },
  { name: 'no "Refer to" paragraph at all',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o), B()])] },
  { name: 'reference folded into the Feedback line, in brackets',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), setText(TPL.feedback, `Feedback: ${o.fb} (${o.ref})`), B()])] },
  { name: 'no blank paragraph between option groups',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o), REF(o)])] },
  { name: 'no blank paragraph after the prompt',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o), REF(o), B()])] },
  { name: 'options labelled "A." rather than "A:"',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, '.'), FB(o), REF(o), B()])] },
  { name: 'header without ", shuffle"',
    build: n => [Q(n, 'multiple choice'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o), REF(o), B()])] },
  { name: 'header capitalised "Multiple Choice, Shuffle"',
    build: n => [Q(n, 'Multiple Choice, Shuffle'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o), REF(o), B()])] },
  { name: 'two-paragraph prompt (the shape --join-prompt removes)',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n, true), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o), REF(o), B()])] },
  { name: 'feedback keeping its verdict word',
    build: n => [Q(n, 'multiple choice, shuffle'), ...PR(n), B(),
      ...OPTS.flatMap(o => [OPT(o, ':'), FB(o, true), REF(o), B()])] },
];

const bodyXml = VARIANTS.map((v, i) => v.build(i + 1).join('')).join('');
const firstPara = paras[0];
const lastPara = paras[paras.length - 1];
const before = xml.slice(0, xml.indexOf(firstPara));
const after = xml.slice(xml.lastIndexOf(lastPara) + lastPara.length);
const out = before + paras.slice(0, si + 1).join('') + bodyXml + paras.slice(ei).join('') + after;

fs.writeFileSync(docPath, out, 'utf8');
const outFile = path.join(OUT, 'PROBE_Cybersecurity_Course_3_import_shapes.docx');
zipDir(ex, outFile);
fs.rmSync(ex, { recursive: true, force: true });

console.log(`WROTE  ${path.basename(outFile)}`);
console.log(`       ${outFile}`);
console.log(`       ${OPTS.length} options cloned from question 1 · ${VARIANTS.length} variants`);
console.log('');
console.log('Upload it to ONE quiz item, then read off which questions arrived:');
VARIANTS.forEach((v, i) => console.log(`  Q${String(i + 1).padStart(2)}  [P${i + 1}]  ${v.name}`));
console.log('');
console.log('P1 is production itself. If P1 imports, the grammar is fine and the difference is');
console.log('in one of the other shapes. If NOTHING imports, the fault is above the section —');
console.log('the Guide Section or the package — not the question grammar.');

// Shared verifier for quiz-import-build.js. Re-opens every generated .docx and checks it twice
// over:
//
//   1. against quizzes.json — grammar, key, option/feedback/prompt text, reference line, the
//      template skeleton and package, as the managing verifier does;
//   2. against the ORIGINAL source document, independently of the parser — every prompt,
//      option and explanation that reached the import section must occur verbatim in its
//      source file. A parser that assigned an explanation to the wrong option, or rejoined a
//      split option wrongly, passes check 1 (the builder copied it faithfully) and fails here.
//
//   node src/quiz-import-verify.js <course> <outDir> [--no-br]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { lines: readLines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const [SLUG, OUT] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!SLUG || !OUT) { console.error('usage: node src/quiz-import-verify.js <course> <outDir> [--no-br]'); process.exit(1); }
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'quizzes.json'), 'utf8'));
const SRC = path.join(SP, SLUG, 'src');
const REF_OWN_LINE = !process.argv.includes('--no-br');
const SEP = REF_OWN_LINE ? '\n' : ' ';
const KIND = { practice: 'Practice Quiz', graded: 'Graded Quiz', final: 'Final Exam' };

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
let fail = 0;
const bad = m => { console.log('   FAIL: ' + m); fail++; };

// Written independently of the builder, so a naming slip there shows up here.
const expectName = qz => `M${qz.module}${qz.lesson ? 'L' + qz.lesson : ''} - ` +
  `${qz.title.replace(/\s*:\s*/g, ' - ')} - ${KIND[qz.kind]}.docx`;
const stripVerdict = t =>
  t.replace(/^(?:\((?:Correct|Incorrect)\)|(?:Correct|Incorrect|Not quite|Wrong)\s*[.:,!—–-])\s*/i, '');
function expectRef(q) {
  let last = null;
  return 'Refer to ' + q.assets.map(a => {
    const at = `Module ${a.module}` + (a.lesson ? ` Lesson ${a.lesson}` : '');
    const s = (at === last ? '' : at + ' ') + `${a.type}: ${a.title}`;
    last = at;
    return s;
  }).join('; ');
}
const squash = s => s.replace(/\s+/g, ' ').trim();

const wantSections = [
  ['Title', null], ['Heading1', 'Getting started'], ['Heading1', 'Import Section'],
  ['Heading3', '----- Importable content starts here -----'],
  ['Heading3', '----- End of importable content -----'],
  ['Heading3', '****The following content is for your reference and will not be imported.****'],
  ['Heading1', 'Guide Section'], ['Heading2', 'Core Information'], ['Heading2', 'Assignment Title'],
  ['Heading2', 'Grading Settings'],
  ['Heading4', 'Grade to Save (Select with ‘*’)'], ['Heading4', 'Assignment Type (Select with ‘*’)'],
  ['Heading4', 'Time Estimate (hh:mm)'], ['Heading4', 'Passing Threshold'],
  ['Heading4', 'Feedback Type (Select with ‘*’)'], ['Heading4', 'Learner Grade Visibility (Select with ‘*’)'],
  ['Heading4', 'Learner Response Visibility (Select with ‘*’)'], ['Heading4', 'Maximum Number of Attempts'],
  ['Heading4', 'Time Limit Per Attempt (hh:mm)'], ['Heading4', 'Maximum Number of Submissions Per Timed Attempt'],
  ['Heading4', 'Plagiarism Detection (Select with ‘*’)'], ['Heading2', 'Instructions for Learners'],
  ['Heading4', 'Learning objectives'], ['Heading4', 'Instructions overview'],
  ['Heading4', 'Review Criteria Summary'], ['Heading2', 'Instructions for Graders'],
  ['Heading4', 'Instructions (not shown to learners)'], ['Heading4', 'Assignment Rubrics'],
  ['Heading2', 'Working area for question design'],
];

const produced = fs.readdirSync(OUT).filter(f => f.endsWith('.docx'));
const expected = quizzes.map(expectName);
for (const f of produced) if (!expected.includes(f)) bad(`unexpected file in output: ${f}`);

let nQ = 0, nFb = 0;
for (const qz of quizzes) {
  const name = expectName(qz);
  const file = path.join(OUT, name);
  console.log(`\n=== ${name}   (from ${qz.file}.docx)`);
  if (!fs.existsSync(file)) { bad('missing output file'); continue; }

  const ex = path.join(SP, 'vfy-ai');
  fs.rmSync(ex, { recursive: true, force: true });
  execFileSync('unzip', ['-o', '-q', file, '-d', ex]);
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml',
                   'word/_rels/document.xml.rels'])
    if (!fs.existsSync(path.join(ex, p))) bad('missing package part ' + p);
  const ct = fs.readFileSync(path.join(ex, '[Content_Types].xml'), 'utf8');
  const rels = fs.readFileSync(path.join(ex, 'word/_rels/document.xml.rels'), 'utf8');
  if (/comments\.xml/.test(ct) || /comments\.xml/.test(rels)) bad('dangling comments.xml reference');

  const xml = fs.readFileSync(path.join(ex, 'word/document.xml'), 'utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const lines = [], xmls = [], heads = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm;
  while ((pm = pRe.exec(body)) !== null) {
    let t = '';
    const tok = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g;
    let tm;
    while ((tm = tok.exec(pm[0])) !== null) t += tm[1] !== undefined ? dec(tm[1]) : '\n';
    lines.push(t.trim());
    xmls.push(pm[0]);
    const st = (pm[0].match(/<w:pStyle w:val="(Title|Heading\d)"\/>/) || [])[1];
    if (st && t.trim()) heads.push({ style: st, text: t.trim() });
  }

  let cursor = 0;
  for (const [style, text] of wantSections) {
    const at = heads.findIndex((h, i) => i >= cursor && h.style === style && (text === null || h.text === text));
    if (at < 0) bad(`template section missing or out of order: <${style}> ${text || '(title)'}`);
    else cursor = at + 1;
  }
  const relIds = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map(m => m[1]));
  const used = new Set([...xml.matchAll(/<w:hyperlink r:id="([^"]+)"/g)].map(m => m[1]));
  if (used.size < 8) bad(`only ${used.size} distinct hyperlinks`);
  for (const id of used) if (!relIds.has(id)) bad('hyperlink points at missing rel ' + id);
  // A stringified value leaking into the text. "undefined" is also an English word — Graded
  // Quiz M2 Q3 of ai-workflows ends "... interpretation undefined." — so it counts only when
  // the source document never uses it.
  const srcRaw = fs.readFileSync(path.join(SRC, qz.file, 'word', 'document.xml'), 'utf8');
  const undefinedIsProse = /\bundefined\b/.test(srcRaw);
  lines.forEach((l, i) => {
    if (/\[object Object\]|\bNaN\b/.test(l) || (!undefinedIsProse && /\bundefined\b/.test(l)))
      bad(`stringified value at line ${i}: "${l.slice(0, 70)}"`);
  });

  const START = '----- Importable content starts here -----';
  const END = '----- End of importable content -----';
  if (lines.filter(l => l === START).length !== 1) bad('start marker is not unique');
  if (lines.filter(l => l === END).length !== 1) bad('end marker is not unique');
  const s = lines.indexOf(START), e = lines.indexOf(END);
  if (lines.slice(0, s).some(l => /^Question \d+ - /.test(l))) bad('question before start marker');

  // Fold each reference paragraph onto the Feedback: paragraph IMMEDIATELY above it — see
  // managing-verify.js. A reference anywhere else stays unfolded and fails the grammar.
  const folded = [];
  lines.slice(s + 1, e).forEach((l, i) => {
    const x = xmls[s + 1 + i], prev = folded[folded.length - 1];
    if (REF_OWN_LINE && /^Refer to Module /.test(l) && prev && /^Feedback: /.test(prev.l)) {
      if (!/w:after="0"/.test(x)) bad(`reference paragraph not zero-spaced: "${l.slice(0, 50)}"`);
      prev.l += SEP + l; prev.x += x;
    } else folded.push({ l, x });
  });
  const sec = folded.filter(p => p.l);
  sec.forEach((p, i) => {
    if (/<w:br\b/.test(p.x)) bad(`line break inside import section at line ${i}`);
    for (const [re, n] of [[/<w:b\b/, 'bold'], [/<w:i\b/, 'italic'], [/<w:u\b/, 'underline'],
      [/<w:strike\b/, 'strike'], [/<w:color\b/, 'colour'], [/<w:highlight\b/, 'highlight']])
      if (re.test(p.x)) bad(`${n} formatting inside import section: "${p.l.slice(0, 50)}"`);
  });

  // Source text, for the independent fidelity check. Lines are squashed and joined with a
  // space, so an option the source split over two list paragraphs is still found.
  const srcText = ' ' + readLines(path.join(SRC, qz.file, 'word', 'document.xml'))
    .filter(Boolean).map(squash).join(' ') + ' ';
  const inSource = t => srcText.includes(' ' + squash(t) + ' ') || srcText.includes(squash(t));

  const idx = [];
  sec.forEach((p, i) => { if (/^Question \d+\b/.test(p.l)) idx.push(i); });
  const stated = +qz.settings.questions;
  if (idx.length !== qz.questions.length) bad(`expected ${qz.questions.length} questions, found ${idx.length}`);
  if (stated && idx.length !== stated) bad(`source settings say ${stated} questions, file has ${idx.length}`);

  idx.forEach((start, k) => {
    const blk = sec.slice(start, k + 1 < idx.length ? idx[k + 1] : sec.length).map(p => p.l);
    const src = qz.questions[k];
    const tag = `Q${src.num}`;
    const ref = expectRef(src);
    if (blk[0] !== `Question ${src.num} - multiple choice, shuffle`) bad(`${tag} header wrong: "${blk[0]}"`);

    const shape = blk.map(l => /^Question \d+ - /.test(l) ? 'H' : /^\*?[A-D]:\s/.test(l) ? 'O'
      : /^Feedback:\s/.test(l) ? 'F' : 'P').join('');
    if (shape !== 'HP' + 'OF'.repeat(4)) bad(`${tag} line grammar is ${shape}, expected HPOFOFOFOF`);

    const prompt = blk[1] || '';
    const wantPrompt = squash(src.prompt.join(' '));
    if (prompt !== wantPrompt) bad(`${tag} prompt mismatch\n      got:  ${prompt}\n      want: ${wantPrompt}`);
    if (/^[A-Za-z.]+\d*\s*:/.test(prompt) && /^\S+:/.test(prompt))
      bad(`${tag} prompt opens with a one-word label: "${prompt.slice(0, 30)}"`);
    // A question replaced through fixes.json is by definition not in the source; an option a
    // fix touched is exempt only for that option. Everything else is still checked.
    const fixed = new Set(src.fixes || []);
    // Source wording before lib-punctuation.js touched it; fidelity is checked on this.
    const orig = src.original || { prompt: null, options: {}, feedback: {} };
    const srcPrompt = orig.prompt || src.prompt;
    const srcOpt = o => orig.options[o.letter] !== undefined ? orig.options[o.letter]
      : fixed.has('option:' + o.letter) ? o.text.slice(0, -1) : o.text;
    const srcFb = o => orig.feedback[o.letter] !== undefined ? orig.feedback[o.letter] : src.feedback[o.letter];
    for (const p of src.punct || []) console.log(`   PUNC ${tag} ${p.field} [${p.rule}]`);
    const replaced = fixed.has('replaced');
    if (replaced) console.log(`   NOTE ${tag} replaced via fixes.json — source-fidelity check skipped for it`);
    if (!replaced) srcPrompt.forEach(p => { if (!inSource(p)) bad(`${tag} prompt text not found in source: "${p.slice(0, 60)}"`); });

    const opts = blk.filter(l => /^\*?[A-D]:\s/.test(l));
    const fbs = blk.filter(l => /^Feedback:\s/.test(l));
    const starred = opts.filter(l => l.startsWith('*'));
    if (starred.length !== 1) bad(`${tag} has ${starred.length} starred answers`);
    else if (starred[0][1] !== src.correct) bad(`${tag} starred ${starred[0][1]}, source key is ${src.correct}`);

    src.options.forEach((o, i) => {
      const wantOpt = (o.letter === src.correct ? '*' : '') + o.letter + ': ' + o.text;
      if (opts[i] !== wantOpt) bad(`${tag} option ${o.letter} mismatch\n      got:  ${opts[i]}\n      want: ${wantOpt}`);
      if (!replaced && !inSource(srcOpt(o))) bad(`${tag} option ${o.letter} not found verbatim in source: "${o.text.slice(0, 60)}"`);

      const expl = stripVerdict(src.feedback[o.letter]);
      const wantFb = 'Feedback: ' + expl + SEP + ref;
      if (fbs[i] !== wantFb) bad(`${tag} feedback ${o.letter} mismatch\n      got:  ${JSON.stringify(fbs[i])}\n      want: ${JSON.stringify(wantFb)}`);
      if (!replaced && !inSource(stripVerdict(srcFb(o)))) bad(`${tag} feedback ${o.letter} not found verbatim in source: "${expl.slice(0, 60)}"`);
      if (/^(Correct|Incorrect|Not quite|Wrong)\s*[.!:,]/i.test(expl)) bad(`${tag} feedback ${o.letter}: verdict left in`);
      if (!/^[A-Z0-9"“'‘(]/.test(expl)) bad(`${tag} feedback ${o.letter} starts oddly: "${expl.slice(0, 40)}"`);
      nFb++;
    });

    // ORDER in the source, from this question's prompt onward. Presence alone would pass two
    // explanations swapped between options; order does not. Lettered and alternating layouts
    // run option, explanation, option, explanation. The keyed layout lists the four options,
    // then "Correct Answer: X", then each explanation under its own letter label.
    const from = srcText.indexOf(squash(srcPrompt[srcPrompt.length - 1]));
    if (replaced) { /* not in the source, by design */ }
    else if (from < 0) bad(`${tag} prompt not located in source`);
    else if (src.layout === 'KEYED') {
      let c = from;
      for (const o of src.options) {
        const p = srcText.indexOf(squash(srcOpt(o)), c);
        if (p < 0) bad(`${tag} option ${o.letter} out of order in source`); else c = p;
      }
      if (srcText.indexOf(`Correct Answer: ${src.correct}`, c) < 0) bad(`${tag} "Correct Answer: ${src.correct}" not after the options`);
      for (const o of src.options) {
        const lab = o.letter === src.correct ? 'Correct Explanation: ' : `Incorrect Explanation — ${o.letter}: `;
        if (srcText.indexOf(lab + squash(srcFb(o)), c) < 0)
          bad(`${tag} explanation ${o.letter} is not labelled "${lab.trim()}" in source`);
      }
    } else {
      let c = from;
      for (const o of src.options) {
        const po = srcText.indexOf(squash(srcOpt(o)), c);
        const pf = po < 0 ? -1 : srcText.indexOf(squash(stripVerdict(srcFb(o))), po);
        const next = src.options[src.options.indexOf(o) + 1];
        const pn = next && pf >= 0 ? srcText.indexOf(squash(srcOpt(next)), pf) : Infinity;
        if (po < 0 || pf < 0 || pn < 0) bad(`${tag} option ${o.letter} and its explanation are not in source order`);
        else c = pf;
      }
    }

    // Asset types vary by course: Video, Reading, Lab, Downloadable Resource, Demo Video, FAQ ...
    if (!/^Refer to Module \d+( Lesson \d+)? [A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*: \S/.test(ref)) bad(`${tag} bad reference "${ref}"`);
    if (/\(\s*\d+\s*mins?\)|\(Lesson \d+\)|\bM\d+L\d+\b/i.test(ref)) bad(`${tag} annotation left in reference "${ref}"`);
    for (const a of src.assets) if (!inSource(a.title)) bad(`${tag} asset title not in source: "${a.title}"`);
    nQ++;
  });
  console.log(`   ${idx.length} questions | ${wantSections.length} template sections | ${used.size} hyperlinks | source fidelity checked`);
  fs.rmSync(ex, { recursive: true, force: true });
}

console.log(fail === 0
  ? `\n✅ ALL CHECKS PASSED — ${quizzes.length} files, ${nQ} questions, ${nFb} feedback blocks; ` +
    'every prompt, option and explanation found verbatim in its source document' +
    (quizzes.some(z => z.questions.some(q => q.fixes))
      ? `, apart from the ${quizzes.reduce((a, z) => a + z.questions.filter(q => q.fixes).length, 0)} ` +
        'question(s) fixes.json changes.'
      : '.')
  : `\n❌ ${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);

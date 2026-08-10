// Parser for the Paid Advertising Across 11 Platforms graded quiz (UPDATED revision).
//
// The third table shape in this repository, and the tidiest of them. Everything a question
// needs is inside its own table, so a question closes when its table ends — no state carried
// across blocks the way paid-social has to carry an answer key that arrives afterwards.
//
//   Source video: 1.1.3 - Google Ads Formats Overview                <- paragraph, before
//   ┌────────────────────┬───────────────────────────────────────┐
//   │ Q1                 │ <prompt>                              │
//   │ Mapped to:         │ M1L1V3                                │
//   │ ✅ Correct Answer: │ B                                     │
//   │ A                  │ <option text>                         │
//   │ Feedback           │ (Incorrect) <explanation>             │
//   │ B                  │ <option text>                         │
//   │ Feedback           │ (Correct) <explanation>               │   … C and D likewise
//   └────────────────────┴───────────────────────────────────────┘
//
// Notes:
//
//   * Module headings use a colon ("Module 1: Google Ads") where paid-social used a dash.
//   * Questions are already numbered 1-10 within each module, so nothing is renumbered.
//     `sourceNum` is still recorded, and a disagreement with the position is reported.
//   * The mapping is stated THREE times — a dotted code in the "Source video" line (1.1.3), an
//     M<x>L<y>V<z> code in the table, and the video's title beside the dotted code. That is
//     what makes this source checkable, and the check earns its keep: on 17 of the 110
//     questions the two codes agree with each other but disagree with the title, and in every
//     one of those the QUESTION is about the title's video, not the code's. The codes were
//     written against an earlier numbering of the outline and never caught up. See resolve()
//     below for the precedence that follows from that, and MAPPING_OVERRIDE to force a case.
//   * Feedback rows carry no letter and belong to the option above them, as in paid-social.
//   * Every explanation opens with a literal "(Correct)" or "(Incorrect)" marker, stripped by
//     the builder. quiz.json keeps the source text verbatim; see stripMarker in
//     paid-ads-11-build.js and its mirror in paid-ads-11-verify.js.
const fs = require('fs');
const path = require('path');
const { readBlocks, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'paid-ads-11';
const blocks = readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the mapping cross-check both come from the outline:\n' +
    `  node src/paid-ads-11-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, index: TITLE_INDEX } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// Force a mapping for a question the rules below cannot settle, keyed "M<module> Q<number>".
// Empty by design — nothing here needs forcing today. The four questions resolve() reports as
// out-of-module (M3 Q2, Q3, Q4, Q6) are a content gap, not a mapping mistake: they ask about
// Microsoft Ads keyword match types, negative keywords, search terms and impression share, and
// module 3's outline has no video on any of those. Pointing them at module 1's videos of the
// same name is the least wrong answer available here; the real fix is in the source.
//   e.g. 'M3 Q2': 'M3L1V5',
const MAPPING_OVERRIDE = {};

// Matching only — never written back into a document.
const norm = s => clean(String(s))
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// The ✅ prefix is part of the answer-key label cell, so it is allowed for here rather than
// stripped from the whole document.
const ROW_LABEL = /^(?:✅\s*)?(Q\s*\d+|Mapped to|Correct Answer|Feedback|[A-D])\s*[.:]?\s*$/i;
const modules = [];
const warn = [];

let cur = null;
let pendingSource = null;   // {code:"1.1.3", key:"M1L1V3", title} from the "Source video:" line

/**
 * Decide which video a question refers to, given the code its table states and the title the
 * "Source video" line writes. Returns {key, why}.
 *
 * The title wins whenever the two disagree. That is not a coin toss: on every one of the 17
 * disagreements in this source the prompt is about the title's video ("In the trim videos
 * feature of Asset Studio…" against a code whose video is "Edit Images"), and four of the
 * codes are off by one from the title's position in the same lesson — the signature of a
 * renumbered outline rather than of a mis-typed title.
 *
 * Within that, a match inside the question's own module beats one outside it. Module 1 (Google
 * Ads) and module 3 (Microsoft Ads) share several generic video names — "Keyword Match Types",
 * "Search Terms" — so a bare title lookup would drag Microsoft questions into the Google
 * module. When only an out-of-module match exists, it is used and reported loudly: the source
 * has a question with no video to point at, which is an authoring decision, not a parse.
 */
function resolve(mod, code, title, where) {
  const forced = MAPPING_OVERRIDE[where];
  if (forced) { warn.push(`${where}: mapping forced to ${forced} by MAPPING_OVERRIDE`); return { key: forced, why: 'override' }; }

  const codeTitle = code && VIDEOS[code] ? VIDEOS[code].video : null;
  if (code && codeTitle && title && norm(codeTitle) === norm(title)) return { key: code, why: 'agree' };
  if (code && codeTitle && !title) return { key: code, why: 'code only' };

  const hits = (title && TITLE_INDEX[norm(title)]) || [];
  const inModule = hits.filter(k => k.startsWith(`M${mod}L`));

  if (inModule.length === 1) {
    warn.push(`${where}: table says ${code || '(none)'}${codeTitle ? ` ("${codeTitle}")` : ''} but the `
      + `video titled "${title}" is ${inModule[0]} — corrected to ${inModule[0]}, the stale code was not used`);
    return { key: inModule[0], why: 'title in module' };
  }
  if (inModule.length > 1) {
    warn.push(`${where}: "${title}" is the title of ${inModule.join(', ')} inside module ${mod} — took the first`);
    return { key: inModule[0], why: 'title in module, ambiguous' };
  }
  if (hits.length) {
    warn.push(`${where}: no video titled "${title}" anywhere in module ${mod}. The only match is `
      + `${hits.join(', ')}, outside this module, and the table's own code ${code || '(none)'} is `
      + `${codeTitle ? `"${codeTitle}"` : 'not in the outline'}. Using ${hits[0]} — the feedback will `
      + 'point outside the module. Add the video to the module, or move the question.');
    return { key: hits[0], why: 'title outside module' };
  }

  if (code && codeTitle) {
    warn.push(`${where}: no video titled "${title}" in the outline; kept the table's code ${code} ("${codeTitle}")`);
    return { key: code, why: 'title unknown, code kept' };
  }
  warn.push(`${where}: neither the code ${code || '(none)'} nor the title "${title}" is in the outline`);
  return { key: code || '', why: 'unresolved' };
}

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    // "Module 1: Google Ads" — a colon here, a dash in paid-social. Accept either.
    if ((m = t.match(/^Module\s+(\d+)\s*[:—–-]\s*(.+)$/i))) {
      cur = { num: +m[1], title: clean(m[2]), questions: [] };
      modules.push(cur);
      pendingSource = null;
      continue;
    }

    // "Source video: 1.1.3 - Google Ads Formats Overview" — module.lesson.video, dotted.
    if ((m = t.match(/^Source video\s*:\s*(\d+)\.(\d+)\.(\d+)\s*(?:[—–-]\s*(.*))?$/i))) {
      pendingSource = { code: `${m[1]}.${m[2]}.${m[3]}`, key: `M${m[1]}L${m[2]}V${m[3]}`,
                        title: clean(m[4] || '') };
      continue;
    }
    if (/^Source video\s*:/i.test(t)) {
      warn.push(`unreadable "Source video" line: "${clean(t)}"`);
      pendingSource = null;
    }
    continue;
  }

  // ---- a question table ----
  const rows = b.rows.filter(r => r.length >= 2 && ROW_LABEL.test(clean(r[0])));
  if (rows.length < 3) continue;
  if (!cur) { warn.push('question table before any module heading — skipped'); continue; }

  const q = { num: 0, sourceNum: null, prompt: '', options: [], correct: null,
              feedback: {}, mapped: '', sourceCode: '', sourceTitle: '' };
  let lastLetter = null;

  for (const cells of rows) {
    const label = clean(cells[0]).replace(/^✅\s*/, '').replace(/[.:]\s*$/, '').toUpperCase();
    const value = (cells[1] || '').split('\n').map(clean).filter(Boolean);
    let m;
    if ((m = label.match(/^Q\s*(\d+)$/))) {
      q.sourceNum = +m[1];
      q.prompt = value.length > 1 ? value.slice() : (value[0] || '');
    } else if (label === 'MAPPED TO') {
      const km = (value[0] || '').match(/M\d+L\d+V\d+/i);
      if (km) q.mapped = km[0].toUpperCase();
      else warn.push(`M${cur.num} Q${q.sourceNum}: unreadable "Mapped to" value "${value[0] || ''}"`);
    } else if (label === 'CORRECT ANSWER') {
      const am = (value[0] || '').match(/^\(?([A-D])\)?\b/i);
      if (am) q.correct = am[1].toUpperCase();
      else warn.push(`M${cur.num} Q${q.sourceNum}: unreadable answer key "${value[0] || ''}"`);
    } else if (/^[A-D]$/.test(label)) {
      q.options.push({ letter: label, text: value.join(' ') });
      lastLetter = label;
    } else if (label === 'FEEDBACK') {
      // Feedback rows carry no letter of their own; each belongs to the option above it.
      if (!lastLetter) { warn.push(`M${cur.num} Q${q.sourceNum}: a Feedback row precedes its option`); continue; }
      if (q.feedback[lastLetter]) warn.push(`M${cur.num} Q${q.sourceNum}: two Feedback rows for option ${lastLetter}`);
      q.feedback[lastLetter] = value.join(' ');
    }
  }

  if (pendingSource) { q.sourceCode = pendingSource.code; q.sourceTitle = pendingSource.title; }
  const sourceKey = pendingSource ? pendingSource.key : '';
  pendingSource = null;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num}`;

  if (!q.prompt || (Array.isArray(q.prompt) && !q.prompt.length)) warn.push(`${where}: no prompt`);
  if (q.sourceNum === null) warn.push(`${where}: table has no "Q<n>" label`);
  else if (q.sourceNum !== q.num) warn.push(`${where}: table is labelled Q${q.sourceNum} but sits at position ${q.num}`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no feedback for ${missing.join(', ')}`);

  if (!q.correct) warn.push(`${where}: no answer key`);
  else if (!q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  // The marker inside each explanation states the key a second time. A disagreement means one
  // of the two was edited alone.
  const marked = Object.entries(q.feedback)
    .filter(([, fb]) => /^\(Correct\)/i.test(fb)).map(([L]) => L);
  if (marked.length !== 1) {
    warn.push(`${where}: ${marked.length} options carry a "(Correct)" marker (${marked.join(', ') || 'none'})`);
  } else if (q.correct && marked[0] !== q.correct) {
    warn.push(`${where}: answer key says ${q.correct} but the "(Correct)" marker is on ${marked[0]}`);
  }
  for (const [L, fb] of Object.entries(q.feedback)) {
    if (!/^\((Correct|Incorrect)\)/i.test(fb)) {
      warn.push(`${where}: feedback ${L} does not open with a (Correct)/(Incorrect) marker: "${fb.slice(0, 40)}"`);
    }
  }

  // The three statements of the mapping. The two codes are checked against each other first —
  // they have never disagreed in this source, and if they start to, that is a different fault
  // from the stale-code one resolve() handles.
  const statedCode = q.mapped || sourceKey;
  if (!q.mapped && sourceKey) warn.push(`${where}: no "Mapped to" row; took ${sourceKey} from the "Source video" line`);
  if (q.mapped && sourceKey && sourceKey !== q.mapped) {
    warn.push(`${where}: "Source video: ${q.sourceCode}" is ${sourceKey} but the table maps to ${q.mapped}`);
  }
  if (!statedCode && !q.sourceTitle) warn.push(`${where}: no mapping at all`);

  const resolved = resolve(cur.num, statedCode, q.sourceTitle, where);
  q.mapped = resolved.key;
  q.mappedBy = resolved.why;
  q.statedCode = statedCode;
  if (q.mapped && !VIDEOS[q.mapped]) warn.push(`${where}: resolved to ${q.mapped}, which the outline has no video for`);

  // A prompt line beginning "Word: " is read by the importer as an answer option.
  for (const line of (Array.isArray(q.prompt) ? q.prompt : [q.prompt])) {
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(line)) {
      warn.push(`${where}: prompt starts with a label-like token: "${String(line).slice(0, 40)}"`);
    }
  }

  cur.questions.push(q);
}

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const lessons = new Set(mo.questions.map(q => (q.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, ${lessons.size} lessons covered`);
  });
  const all = modules.flatMap(m => m.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(q => q.mapped).length} mapped · `
    + `${all.reduce((a, q) => a + Object.keys(q.feedback).length, 0)} feedback blocks`);
  const byWhy = {};
  for (const q of all) byWhy[q.mappedBy] = (byWhy[q.mappedBy] || 0) + 1;
  console.log('mapping source: ' + Object.entries(byWhy).map(([k, v]) => `${v} ${k}`).join(' · '));
  const byLetter = {};
  for (const q of all) byLetter[q.correct] = (byLetter[q.correct] || 0) + 1;
  console.log('answer key spread: ' + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}

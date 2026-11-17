// Parser for the HAWS Course 4 module graded quizzes (Human + AI: Collaborative Intelligence,
// Human Judgment & Responsible AI Use).
//
// One document per module — work/haws-c4/docs/C4M1_GAQs, C4M2_GAQs, C4M3_GAQs — with the
// module number taken from the FOLDER NAME, as in haws-c2 and haws-c3. The three were
// delivered as C4M1-GAQS.docx, "C4M2- GAQ.docx" and C4M3-GAQ.docx, so the number is matched
// out of the name rather than compared against it.
//
// THE THREE MODULES ARE WRITTEN IN THREE DIFFERENT GRAMMARS, and they are not the three
// Course 3 used either. Every shape below is accepted and the module a line came from is never
// assumed:
//
//   M1   GAQ 1                           header alone, no code on it
//        Reference: C4M1L1V1 – Ethical Risks in AI Systems
//        Question:                       label ALONE; the prompt is the next line
//        a) <option>                     lowercase, ")"
//        Correct Answer:                 label ALONE
//        b) <the option restated in full> the letter comes from this line
//        Correct Explanation:            label ALONE
//        <text>
//        Incorrect (a):                  label ALONE, bracketed letter
//        <text>
//
//   M2   Q1. <prompt>                    haws-c2's grammar exactly
//        A. <option>                     UPPERCASE, "."
//        ✅ Correct Answer: C
//        Mapped to: M2L1V1               a separate line, no course prefix
//        Explanation for Option C (Correct):
//        <text>
//        Explanation for Option A:       one labelled block per option
//        <text>
//
//   M3   GAQ 1
//        Reference: C4M3L1V1 – Defining Scope and Objectives for AI Workflows
//        Question: <prompt>              inline
//        a) <option>
//        Correct Answer: a               inline, bare letter
//        Correct Explanation: <text>     inline
//        Incorrect Answer Explanations:
//        b) <text>                       SAME FORM AS AN OPTION
//
// Two ambiguities make this mode-driven rather than pattern-driven:
//
//   * a lettered line is an OPTION before the key and an EXPLANATION after the
//     incorrect-explanations heading. M3 writes both as "b) …"; reading the second group as
//     options would give each question seven options and no feedback.
//   * M1 restates the whole correct option on the line after a bare "Correct Answer:", which
//     is also shaped like an option. It is only read as the key because the label opened a
//     pending state, and the text it restates is compared with the option it names.
//
// Each module's last question is cross-cutting and says so. M1 and M3 write
// "Reference: Cross-Module Integration – C4M1 Lessons 1–3" and name no video, so they get no
// reference line rather than an invented one — the decision haws-c2 and haws-c3 made. M2's
// says "Mapped to: Cross-Module Integration – M2 L1V3", which carries BOTH the marker and a
// resolvable code; the code is honoured, because the author wrote one, and the disagreement
// with the other two modules is reported rather than smoothed over.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'haws-c4';
const COURSE_NO = 4;

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module titles and every reference come from the outline:\n'
    + `  node src/${SLUG}-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const DOCDIR = path.join(SP, SLUG, 'docs');
const DOCS = fs.readdirSync(DOCDIR)
  .map(name => ({ name, mod: Number((name.match(/C\d+M(\d+)/i) || [])[1]) }))
  .filter(d => d.mod)
  .sort((a, b) => a.mod - b.mod)
  .map(d => Object.assign(d, { file: path.join(DOCDIR, d.name, 'word', 'document.xml') }))
  .filter(d => fs.existsSync(d.file));
if (!DOCS.length) throw new Error('no C<n>M<n> GAQ documents under ' + DOCDIR);

const verbatim = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

const GAQ    = /^GAQ\s*(\d+)\s*[:.]?\s*$/i;
const Q_DOT  = /^Q(\d+)\s*\.\s*(.+)$/i;
// "M2 L1V3" occurs with a space inside it, so the parts are matched separately rather than as
// one token. The course prefix is optional: M1 and M3 write it, M2 does not.
const CODE   = /(?:C(\d+))?\s*M\s*(\d+)\s*L\s*(\d+)\s*V\s*(\d+)/gi;
const REF    = /^(?:Reference|Mapped\s+to)\s*:\s*(.+)$/i;
const CROSS  = /cross[-\s]?(?:module|functional|lesson)/i;
const Q_LBL  = /^Question\s*:\s*(.*)$/i;
const OPT_P  = /^([A-Da-d])\)\s*(.+)$/;
const OPT_D  = /^([A-Da-d])\.\s+(.+)$/;
const KEY     = /^[^A-Za-z]*Correct\s+Answer\s*:\s*(.*)$/i;
const C_EXPL  = /^Correct\s+Explanation\s*:\s*(.*)$/i;
const EXPL_OPT = /^Explanation\s+for\s+Option\s+([A-Da-d])\s*(\(\s*Correct\s*\))?\s*:\s*(.*)$/i;
const I_HEAD  = /^(?:Explain\s+Incorrect\s+Options|Incorrect\s+Answer\s+Explanations)\s*:?\s*$/i;
const I_BRACK = /^Incorrect\s*\(([A-Da-d])\)\s*:\s*(.*)$/i;
const I_COLON = /^([A-Da-d])\s*:\s+(.+)$/;
// Authoring notes that follow the last question. Not content; see the note where this is used.
const TRAILER = /^(?:Three[-\s]?Pass\s+Verification|Final\s+Answer\s+Distribution|Answer\s+Distribution|Pass\s+\d+\s*:|[A-D]\s*=\s*\d+\s*$)/i;

const warn = [];
const modules = [];

for (const doc of DOCS) {
  const n = doc.mod;
  const mmeta = MMETA['M' + n] || { title: '', lessons: {} };
  const mo = { num: n, title: mmeta.title, questions: [] };
  modules.push(mo);

  const L = lines(doc.file).map(verbatim).filter(s => s.trim());

  const starts = [];
  L.forEach((l, i) => { if (GAQ.test(clean(l)) || Q_DOT.test(clean(l))) starts.push(i); });
  if (!starts.length) { warn.push(`M${n}: no "GAQ <n>" or "Q<n>." header anywhere in the document`); continue; }

  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : L.length;
    const blk = L.slice(start, end);
    const headText = clean(blk[0]);
    const gm = headText.match(GAQ);
    const qm = headText.match(Q_DOT);
    const sourceNum = +( (gm || qm)[1] );
    const where = `M${n} Q${sourceNum}`;

    const q = {
      num: k + 1, sourceNum,
      prompt: '', _prompt: [],
      options: [], correct: null, correctExplFor: [], feedback: {},
      mapped: '', mappedAll: [], crossCutting: false, hasScenario: false,
    };
    if (qm && qm[2].trim()) q._prompt.push(qm[2]);

    let mode = qm ? 'prompt' : 'head';
    let pending = null;              // a label whose value sits on the following line

    for (let i = 1; i < blk.length; i++) {
      const line = blk[i];
      const t = clean(line);
      let m;

      // M3 closes the document with an authoring note — "Three-Pass Verification Summary",
      // "Pass 1: …", "Final Answer Distribution:", "A = 3". It follows the last explanation of
      // the last question, so without this the whole note is appended to that explanation as
      // continuation text and the built document carries it into the learner's feedback. It
      // failed the verifier as a line break inside feedback, which is the only reason it was
      // caught; a shorter note would have imported silently.
      if (TRAILER.test(t)) break;

      // ---- the citation, however it is labelled ----
      if ((m = t.match(REF))) {
        const body = m[1];
        for (const cm of body.matchAll(CODE)) {
          if (cm[1] && +cm[1] !== COURSE_NO) {
            warn.push(`${where}: cites course ${cm[1]}, not course ${COURSE_NO}`);
          }
          q.mappedAll.push(`M${+cm[2]}L${+cm[3]}V${+cm[4]}`);
        }
        if (!q.mappedAll.length && CROSS.test(body)) q.crossCutting = true;
        else if (CROSS.test(body)) {
          warn.push(`${where}: marked cross-cutting but also cites ${q.mappedAll.join(', ')} — `
            + 'the code is used; the other modules write cross-cutting questions with no code');
        }
        if (!q.mappedAll.length && !q.crossCutting) {
          warn.push(`${where}: no code and no cross-cutting marker in "${body.slice(0, 54)}"`);
        }
        q.mapped = q.mappedAll[0] || '';
        pending = null;
        continue;
      }

      if ((m = t.match(Q_LBL))) {
        if (m[1].trim()) q._prompt.push(verbatim(line).replace(/^\s*Question\s*:\s*/i, ''));
        else pending = 'prompt';
        mode = 'prompt';
        continue;
      }

      if ((m = t.match(KEY))) {
        const rest = m[1].trim();
        if (rest) {
          const lm = rest.match(/^\(?([A-Da-d])\)?\b/);
          if (lm) q.correct = lm[1].toUpperCase();
          else warn.push(`${where}: cannot read a letter from "Correct Answer: ${rest.slice(0, 32)}"`);
          // M3 states the letter alone; M1 restates the option on the NEXT line instead.
          const tail = rest.replace(/^\(?[A-Da-d]\)?[).:\s]*/, '');
          if (tail) checkRestated(q, tail, where);
        } else pending = 'key';
        mode = 'key';
        continue;
      }

      if ((m = t.match(C_EXPL))) {
        if (m[1].trim()) { setCorrectExpl(q, verbatim(line).replace(/^\s*Correct\s+Explanation\s*:\s*/i, ''), where); pending = null; }
        else pending = 'cexpl';
        mode = 'cexpl';
        continue;
      }

      // M2: one labelled block per option, "(Correct)" marking the key.
      if ((m = t.match(EXPL_OPT))) {
        const letter = m[1].toUpperCase();
        if (m[2]) q.correctExplFor.push(letter);
        if (m[3].trim()) { q.feedback[letter] = verbatim(line).replace(/^[\s\S]*?:\s*/, ''); pending = null; }
        else pending = letter;
        mode = 'expl';
        continue;
      }

      if (I_HEAD.test(t)) { mode = 'incorrect'; pending = null; continue; }

      // M1: "Incorrect (a):" with its text on the next line.
      if ((m = t.match(I_BRACK))) {
        const letter = m[1].toUpperCase();
        if (m[2].trim()) { q.feedback[letter] = verbatim(line).replace(/^[\s\S]*?:\s*/, ''); pending = null; }
        else pending = letter;
        mode = 'incorrect';
        continue;
      }

      // M3: under "Incorrect Answer Explanations:" the wrong options are keyed exactly as the
      // options were — "b) Expanding workflow scope too quickly…". Only the mode separates the
      // two, which is why this branch sits inside it and the option branch below excludes it.
      if (mode === 'incorrect' && (m = t.match(OPT_P) || t.match(I_COLON))) {
        const letter = m[1].toUpperCase();
        if (letter === q.correct) {
          warn.push(`${where}: option ${letter} is the key but is also explained as incorrect`);
        }
        if (q.feedback[letter]) warn.push(`${where}: two explanations for option ${letter}`);
        q.feedback[letter] = verbatim(line).replace(/^\s*[A-Da-d]\s*[).:]\s*/, '');
        pending = null;
        continue;
      }

      // An option — ONLY before the key, and never once the explanations have begun.
      if (mode !== 'incorrect' && mode !== 'expl' && !q.correct && pending !== 'key'
          && (m = t.match(OPT_P) || t.match(OPT_D))) {
        q.options.push({ letter: m[1].toUpperCase(), text: verbatim(line).replace(/^\s*[A-Da-d][).]\s*/, '') });
        mode = 'opts';
        continue;
      }

      // The value of a label that opened on the previous line.
      if (pending === 'prompt') { q._prompt.push(verbatim(line)); pending = null; continue; }
      if (pending === 'key') {
        const lm = t.match(/^([A-Da-d])[).]\s*(.*)$/);
        if (lm) { q.correct = lm[1].toUpperCase(); if (lm[2]) checkRestated(q, lm[2], where); }
        else warn.push(`${where}: "Correct Answer:" is followed by "${t.slice(0, 40)}", which names no option`);
        pending = null;
        continue;
      }
      if (pending === 'cexpl') { setCorrectExpl(q, verbatim(line), where); pending = null; continue; }
      if (typeof pending === 'string' && pending.length === 1) {
        q.feedback[pending] = verbatim(line);
        pending = null;
        continue;
      }

      // A continuation of whatever was last opened.
      if (mode === 'prompt') { q._prompt.push(verbatim(line)); continue; }
      const open = Object.keys(q.feedback).pop();
      if ((mode === 'incorrect' || mode === 'expl' || mode === 'cexpl') && open && q.feedback[open]) {
        q.feedback[open] += '\n' + verbatim(line);
        continue;
      }
      warn.push(`${where}: unplaced line "${t.slice(0, 56)}"`);
    }

    // ---- shape ----
    const parts = q._prompt.map(verbatim).filter(Boolean);
    q.prompt = parts.length === 1 ? parts[0] : parts;
    q.hasScenario = /^\s*Scenario\s*:/i.test(parts[0] || '');
    delete q._prompt;

    if (!parts.length) warn.push(`${where}: no prompt`);
    if (q.sourceNum !== q.num) {
      warn.push(`${where}: the document numbers it ${sourceNum} but it sits at position ${q.num}`);
    }
    const letters = q.options.map(o => o.letter).sort().join('');
    if (letters !== 'ABCD') warn.push(`${where}: options are "${letters}", expected ABCD`);
    if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
    else if (!q.options.some(o => o.letter === q.correct)) {
      warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
    }
    // Coursera refuses repeated options with "Duplicate answers are not allowed" and nothing
    // else notices. SETUP section 6, convention 4.
    {
      const seen = new Map();
      for (const o of q.options) {
        const kk = clean(o.text).toLowerCase();
        if (seen.has(kk)) warn.push(`${where}: options ${seen.get(kk)} and ${o.letter} are identical`);
        else seen.set(kk, o.letter);
      }
    }
    const missing = q.options.map(o => o.letter).filter(x => !q.feedback[x]);
    if (missing.length) warn.push(`${where}: no explanation for ${missing.join(', ')}`);
    if (q.correctExplFor.length && q.correct && !q.correctExplFor.includes(q.correct)) {
      warn.push(`${where}: the key says ${q.correct} but the "(Correct)" explanation is on `
        + `${q.correctExplFor.join(', ')}`);
    }
    if (!q.mappedAll.length && !q.crossCutting) {
      warn.push(`${where}: no citation line at all`);
    }
    for (const code of q.mappedAll) {
      const v = VIDEOS[code];
      if (!v) { warn.push(`${where}: cites ${code}, which the outline has no video for`); continue; }
      if (v.module !== n) warn.push(`${where}: cites ${code}, which is outside module ${n}`);
    }

    mo.questions.push(q);
  });
}

// The correct option is restated in full beside the key in M1. That is a second statement of
// which option is right, so it is compared rather than discarded.
function checkRestated(q, text, where) {
  const opt = q.options.find(o => o.letter === q.correct);
  if (!opt) return;
  if (clean(opt.text).toLowerCase() !== clean(text).toLowerCase()) {
    warn.push(`${where}: the key restates option ${q.correct} as "${clean(text).slice(0, 44)}…" but `
      + `the option reads "${clean(opt.text).slice(0, 44)}…"`);
  }
}
function setCorrectExpl(q, text, where) {
  if (!q.correct) { warn.push(`${where}: "Correct Explanation" before the key line`); return; }
  q.feedback[q.correct] = text;
  q.correctExplFor.push(q.correct);
}

if (process.argv.includes('--report')) {
  for (const mo of modules) {
    const used = new Set(mo.questions.flatMap(x => x.mappedAll));
    const all = Object.keys(VIDEOS).filter(k => VIDEOS[k].module === mo.num);
    const lessons = new Set([...used].map(c => (c.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${lessons.size} lessons covered, ${used.size} of ${all.length} videos referenced`
      + (mo.questions.some(x => x.crossCutting)
        ? `, ${mo.questions.filter(x => x.crossCutting).length} cross-cutting with no reference` : ''));
  }
  const all = modules.flatMap(mo => mo.questions);
  const byLetter = {};
  for (const x of all) byLetter[x.correct] = (byLetter[x.correct] || 0) + 1;
  const longest = all.flatMap(x => [...(Array.isArray(x.prompt) ? x.prompt : [x.prompt]),
    ...Object.values(x.feedback)]).reduce((a, s) => Math.max(a, String(s).length), 0);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.reduce((a, x) => a + x.options.length, 0)} options · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} explanations · `
    + `${all.filter(x => x.hasScenario).length} scenarios`);
  console.log('answer key spread: '
    + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`video coverage:    ${new Set(all.flatMap(x => x.mappedAll)).size} of `
    + `${Object.keys(VIDEOS).length} videos referenced`);
  console.log(`longest line:      ${longest} characters`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}

// Parser for the HAWS Course 3 module graded quizzes (Building Human + AI Systems: Workflows,
// Automation, Innovation & Future Skills).
//
// One document per module — work/haws-c3/docs/C3M1_GAQs, C3M2_GAQs, C3M3_GAQs — with the
// module number taken from the FOLDER NAME, as in haws-c2. Nothing inside a document states
// which module it is except a banner line, and the three were delivered with inconsistent
// filenames (C3M1_GAQs.docx, C3M2-GAQs.docx), so the number is matched out of the name rather
// than compared against it.
//
// THE THREE MODULES ARE WRITTEN IN THREE DIFFERENT GRAMMARS. They share a question header and
// a key line and agree on nothing else, so every shape below is accepted and the module a line
// came from is never assumed:
//
//   M1   Question: <prompt>              inline after the label
//        A) <option>                     UPPERCASE letter, ")"
//        Correct Answer: A) <option text restated in full>
//        Correct Explanation: <text>
//        Explain Incorrect Options:
//        Incorrect (B): <text>           letter in a bracketed label
//
//   M2   Question:                       label ALONE; the prompt is the next line
//        a) <option>                     lowercase letter, ")"
//        Correct Answer: c               bare lowercase letter, no restated text
//        Correct Explanation: <text>
//        Incorrect Answer Explanations:
//        b) <text>                       SAME FORM AS AN OPTION — see below
//
//   M3   Question: <prompt>              inline
//        A) <option>
//        Correct Answer: B               bare letter
//        Correct Explanation: <text>
//        Incorrect Answer Explanations:
//        A: <text>                       letter and a COLON
//
// M2's incorrect explanations are written exactly like its options — "b) Isolated automation
// limits…" is indistinguishable from an option line on its own. Only POSITION separates them,
// so the reader is mode-driven: a lettered line is an option before the key line and an
// explanation after the incorrect-explanations heading, and never the other way round. Reading
// them as options instead would give each question eight options and no feedback.
//
// Two further things this source does:
//
//   * a question may cite TWO videos — "GAQ 10: C3M1L1V3 / C3M1L3V3 - Cross-Lesson
//     Integration" — which SETUP section 6 says becomes one `Refer to` with the items joined
//     by "; ". Codes are stored as a list for that reason, even when there is only one.
//   * codes carry the course prefix ("C3M1L1V1") while the outline map is keyed without it
//     ("M1L1V1"), so the prefix is stripped on the way in and the course number it states is
//     checked rather than discarded.
//
// M3 also ships a reference TABLE — GAQ number, code, source topic, correct answer — which
// states the mapping and the key a second time, independently of the question text. Where it
// is present it is read and compared, because it is the only external witness this source
// offers for either.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'haws-c3';
const COURSE_NO = 3;

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

// Content reaches the import verbatim: trim the ends, fold a non-breaking space, and leave a
// run of spaces inside a line as the author wrote it.
const verbatim = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// "GAQ 10: C3M1L1V3 / C3M1L3V3 - Cross-Lesson Integration". The separator before the title is
// a hyphen in M1 and M3 and an en dash in M2.
const HEAD   = /^GAQ\s*(\d+)\s*[:.]\s*(.+?)\s*[-–—]\s+(.+)$/i;
const CODE   = /C(\d+)M(\d+)L(\d+)V(\d+)/gi;
const Q_LBL  = /^Question\s*:\s*(.*)$/i;
const OPTION = /^([A-Da-d])\)\s*(.+)$/;
const KEY    = /^Correct\s+Answer\s*:\s*\(?([A-Da-d])\)?\s*(.*)$/i;
const C_EXPL = /^Correct\s+Explanation\s*:\s*(.*)$/i;
const I_HEAD = /^(?:Explain\s+Incorrect\s+Options|Incorrect\s+Answer\s+Explanations)\s*:?\s*$/i;
// The three incorrect-explanation forms, in order of specificity. The bare "x) text" form is
// last because it is also an option; it is only ever tried in incorrect mode.
const I_BRACKET = /^Incorrect\s*\(([A-Da-d])\)\s*:\s*(.+)$/i;
const I_COLON   = /^([A-Da-d])\s*:\s+(.+)$/;
const I_PAREN   = /^([A-Da-d])\)\s*(.+)$/;

const warn = [];
const modules = [];

// --- M3's reference table: GAQ | Reference | Source Topic | Correct Answer ------------------
// Read straight from the XML rather than through lines(), which flattens a table into its
// paragraphs and loses which cell a value came from.
function referenceTable(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = {};
  for (const tm of xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)) {
    const rows = [...tm[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(rm =>
      [...rm[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(cm =>
        clean([...cm[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x => x[1]).join(''))));
    if (!rows.length || !/^GAQ$/i.test(rows[0][0] || '')) continue;
    const head = rows[0].map(h => h.toLowerCase());
    const iRef = head.findIndex(h => /reference/.test(h));
    const iKey = head.findIndex(h => /correct answer/.test(h));
    for (const r of rows.slice(1)) {
      const n = Number(r[0]);
      if (!n) continue;
      out[n] = {
        code: iRef >= 0 ? (r[iRef] || '').toUpperCase() : '',
        key: iKey >= 0 ? (r[iKey] || '').toUpperCase() : '',
      };
    }
  }
  return out;
}

for (const doc of DOCS) {
  const n = doc.mod;
  const mmeta = MMETA['M' + n] || { title: '', lessons: {} };
  const mo = { num: n, title: mmeta.title, questions: [] };
  modules.push(mo);

  const table = referenceTable(doc.file);
  const L = lines(doc.file).map(verbatim).filter(s => s.trim());

  const starts = [];
  L.forEach((l, i) => { if (HEAD.test(l)) starts.push(i); });
  if (!starts.length) { warn.push(`M${n}: no "GAQ <n>:" header anywhere in the document`); continue; }

  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : L.length;
    const blk = L.slice(start, end);
    const head = clean(blk[0]).match(HEAD);
    const sourceNum = +head[1];
    const where = `M${n} Q${sourceNum}`;

    // ---- the cited codes, from the header ----
    //
    // Each module closes with a question that draws on the module as a whole, and says so:
    // "GAQ 10: C3M2 Cross-Functional" and "GAQ 10: C3M3 Cross-Lesson" name the module and no
    // video. Those get NO reference line rather than an invented one — the same decision
    // haws-c2 made for its cross-functional module. M1 does it differently and cites both
    // videos ("C3M1L1V3 / C3M1L3V3"), which becomes one Refer to with the two joined.
    const codes = [];
    for (const cm of head[2].matchAll(CODE)) {
      if (+cm[1] !== COURSE_NO) {
        warn.push(`${where}: cites ${cm[0]}, which is course ${cm[1]} and not course ${COURSE_NO}`);
      }
      codes.push(`M${+cm[2]}L${+cm[3]}V${+cm[4]}`);
    }
    const crossMatch = head[2].match(new RegExp(`^C(\\d+)M(\\d+)\\s+Cross[-\\s]?(?:Functional|Lesson)`, 'i'));
    const crossCutting = !codes.length && !!crossMatch;
    if (crossCutting && +crossMatch[2] !== n) {
      warn.push(`${where}: marked cross-cutting for module ${crossMatch[2]}, but sits in module ${n}`);
    }
    if (!codes.length && !crossCutting) {
      warn.push(`${where}: no M<x>L<y>V<z> code and no cross-cutting marker in the header `
        + `"${clean(blk[0]).slice(0, 60)}"`);
    }

    const q = {
      num: k + 1, sourceNum,
      assetTitle: verbatim(head[3]),
      prompt: '', _prompt: [],
      options: [], correct: null, correctExplFor: [], feedback: {},
      mapped: codes[0] || '', mappedAll: codes, crossCutting, hasScenario: false,
    };

    let mode = 'head';
    let pending = null;              // a label whose text is on the following line
    for (let i = 1; i < blk.length; i++) {
      const line = blk[i];
      let m;

      if ((m = line.match(Q_LBL))) {
        if (m[1].trim()) q._prompt.push(m[1]);
        else pending = 'prompt';
        mode = 'prompt';
        continue;
      }
      if ((m = line.match(KEY))) {
        q.correct = m[1].toUpperCase();
        // M1 restates the whole option after the letter. That is a second statement of which
        // option is right, so it is compared rather than discarded.
        if (m[2] && m[2].trim()) {
          const opt = q.options.find(o => o.letter === q.correct);
          if (opt && clean(opt.text) !== clean(m[2])) {
            warn.push(`${where}: the key restates option ${q.correct} as "${clean(m[2]).slice(0, 48)}…" `
              + `but the option reads "${clean(opt.text).slice(0, 48)}…"`);
          }
        }
        mode = 'key'; pending = null;
        continue;
      }
      if ((m = line.match(C_EXPL))) {
        if (!q.correct) { warn.push(`${where}: "Correct Explanation" before the key line`); }
        else if (m[1].trim()) { q.feedback[q.correct] = verbatim(m[1]); q.correctExplFor.push(q.correct); }
        else { pending = 'correct'; q.correctExplFor.push(q.correct); }
        mode = 'cexpl';
        continue;
      }
      if (I_HEAD.test(line)) { mode = 'incorrect'; pending = null; continue; }

      // An option, but ONLY before the key line. After the incorrect-explanations heading the
      // same shape means an explanation; see the note at the top.
      if (mode !== 'incorrect' && !q.correct && (m = line.match(OPTION))) {
        q.options.push({ letter: m[1].toUpperCase(), text: verbatim(m[2]) });
        mode = 'opts'; pending = null;
        continue;
      }

      if (mode === 'incorrect') {
        m = line.match(I_BRACKET) || line.match(I_COLON) || line.match(I_PAREN);
        if (m) {
          const letter = m[1].toUpperCase();
          if (letter === q.correct) {
            warn.push(`${where}: option ${letter} is the key but is also explained as incorrect`);
          }
          if (q.feedback[letter] && letter !== q.correct) {
            warn.push(`${where}: two explanations for option ${letter}`);
          }
          q.feedback[letter] = verbatim(m[2]);
          pending = letter;
          continue;
        }
      }

      if (pending === 'prompt') { q._prompt.push(line); pending = null; continue; }
      if (pending === 'correct') { q.feedback[q.correct] = verbatim(line); pending = null; continue; }
      if (mode === 'prompt') { q._prompt.push(line); continue; }
      if (typeof pending === 'string' && q.feedback[pending]) {
        q.feedback[pending] += '\n' + verbatim(line);
        continue;
      }
      if (mode === 'cexpl' && q.correct && q.feedback[q.correct]) {
        q.feedback[q.correct] += '\n' + verbatim(line);
        continue;
      }
      warn.push(`${where}: unplaced line "${clean(line).slice(0, 56)}"`);
    }

    // ---- shape ----
    const parts = q._prompt.map(verbatim).filter(Boolean);
    q.prompt = parts.length === 1 ? parts[0] : parts;
    q.hasScenario = /^\s*Scenario\s*:/i.test(parts[0] || '');
    delete q._prompt;

    if (!parts.length) warn.push(`${where}: no prompt`);
    if (q.sourceNum !== q.num) {
      warn.push(`${where}: the document numbers it GAQ ${q.sourceNum} but it sits at position ${q.num}`);
    }
    const letters = q.options.map(o => o.letter).sort().join('');
    if (letters !== 'ABCD') warn.push(`${where}: options are "${letters}", expected ABCD`);
    if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
    else if (!q.options.some(o => o.letter === q.correct)) {
      warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
    }
    // Coursera refuses a question whose options repeat, with "Duplicate answers are not
    // allowed", and nothing else notices. SETUP section 6, convention 4.
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
    if (q.correctExplFor.length !== 1) {
      warn.push(`${where}: ${q.correctExplFor.length} "Correct Explanation" lines`);
    }

    for (const code of q.mappedAll) {
      const v = VIDEOS[code];
      if (!v) { warn.push(`${where}: cites ${code}, which the outline has no video for`); continue; }
      if (v.module !== n) warn.push(`${where}: cites ${code}, which is outside module ${n}`);
    }

    // ---- the reference table, where the module ships one ----
    const row = table[sourceNum];
    if (row) {
      if (row.code && !q.crossCutting) {
        const want = row.code.replace(new RegExp(`^C${COURSE_NO}`, 'i'), '');
        if (!q.mappedAll.includes(want)) {
          warn.push(`${where}: the header cites ${q.mappedAll.join(' / ') || 'nothing'} but the `
            + `reference table says ${row.code}`);
        }
      }
      if (row.key && q.correct && row.key !== q.correct) {
        warn.push(`${where}: the key line says ${q.correct} but the reference table says ${row.key}`);
      }
    }

    mo.questions.push(q);
  });

  if (Object.keys(table).length) {
    const missing = Object.keys(table).filter(x => !mo.questions.some(y => String(y.sourceNum) === x));
    if (missing.length) warn.push(`M${n}: the reference table lists GAQ ${missing.join(', ')} but the `
      + 'document has no such question');
  }
}

if (process.argv.includes('--report')) {
  for (const mo of modules) {
    const used = new Set(mo.questions.flatMap(x => x.mappedAll));
    const all = Object.keys(VIDEOS).filter(k => VIDEOS[k].module === mo.num);
    const lessons = new Set([...used].map(c => (c.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${lessons.size} lessons covered, ${used.size} of ${all.length} videos referenced`
      + (mo.questions.some(x => x.mappedAll.length > 1)
        ? `, ${mo.questions.filter(x => x.mappedAll.length > 1).length} citing two` : '')
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

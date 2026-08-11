// Parser for the Build Websites on 15 Platforms graded quiz.
//
// Table shape as shopify — a source line above each table, letterless Feedback rows belonging
// to the option above them, "(Correct)" / "(Incorrect)" markers, and NO answer-key line, so
// the "(Correct)" marker IS the key here rather than a second opinion about it.
//
// What makes this source different is its own opening notice, which the parser reads rather
// than ignores:
//
//   SOURCING NOTICE: caption files were available for only 64 of this course's 308 videos.
//   28 questions are drawn directly from video transcripts. The remaining 122 are marked
//   [DRAFT - no transcript] and were written from the module, lesson, and video titles …
//   Every DRAFT question requires SME verification against the recorded lessons …
//
// That split shows up as two different source lines, and they map to two different levels:
//
//   Source video: Wordpress Installation                          -> a VIDEO. Stated as a
//                                                                    title, resolved through
//                                                                    the outline's index.
//   Source: Module 3, Lesson 3.1 - Wix account setup …  [DRAFT]   -> a LESSON only. There is
//                                                                    no video to point at.
//
// A lesson-level mapping is kept as "M3L1" rather than being guessed up to a video, and the
// builder writes "(Refer to M3L1: <lesson title>)" for it. Inventing a video would put a
// specific, wrong pointer in front of a learner; naming the lesson is what the source actually
// supports. websites-15-build.js and its verifier both accept either form.
//
// Every DRAFT question carries `draft: true` into quiz.json, and the builder lists it in the
// working area so nobody publishes 122 unverified questions without seeing that they are.
const fs = require('fs');
const path = require('path');
const { readBlocks } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'websites-15';
const blocks = readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'Video titles are resolved through the outline, so it must be parsed first:\n' +
    `  node src/websites-15-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, index: TITLE_INDEX, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
const verbatim = s => String(s).replace(/ /g, ' ').replace(/^\s+|\s+$/g, '');
const norm = s => clean(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const ROW_LABEL = /^(Q\s*\d+|Feedback|[A-D])\s*[.:]?\s*$/i;
const modules = [];
const warn = [];
const notice = { videos: null, captioned: null, transcript: null, draft: null };

let cur = null;
let pending = null;   // {level:'video'|'lesson', title|module,lesson, draft}

// A video title, preferring a match inside the question's own module — the same rule
// paid-ads-11 applies, and for the same reason: a 15-platform course repeats video names
// ("Blog", "Apps", "Settings") across modules.
function resolveVideoTitle(title, mod, where) {
  const hits = (title && TITLE_INDEX[norm(title)]) || [];
  const inModule = hits.filter(k => k.startsWith(`M${mod}L`));
  if (inModule.length === 1) return inModule[0];
  if (inModule.length > 1) {
    warn.push(`${where}: "${title}" is the title of ${inModule.join(', ')} inside module ${mod} — took the first`);
    return inModule[0];
  }
  if (hits.length) {
    warn.push(`${where}: no video titled "${title}" in module ${mod}; the only match is ${hits.join(', ')}, `
      + 'outside this module — the reference will point outside the module');
    return hits[0];
  }
  warn.push(`${where}: no video titled "${title}" anywhere in the outline — left unmapped`);
  return '';
}

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    if ((m = t.match(/^SOURCING NOTICE\s*:\s*(.+)$/i))) {
      const n = m[1];
      const cap = n.match(/only\s+(\d+)\s+of this course's\s+(\d+)\s+videos/i);
      if (cap) { notice.captioned = +cap[1]; notice.videos = +cap[2]; }
      const tr = n.match(/(\d+)\s+questions are drawn directly from video transcripts/i);
      if (tr) notice.transcript = +tr[1];
      const dr = n.match(/remaining\s+(\d+)\s+are marked/i);
      if (dr) notice.draft = +dr[1];
      continue;
    }
    // "9 of the 10 questions in this module are DRAFT and need SME verification."
    if ((m = t.match(/^(\d+)\s+of the\s+(\d+)\s+questions in this module are DRAFT/i))) {
      if (cur) cur.claimedDraft = +m[1];
      continue;
    }

    if ((m = t.match(/^Module\s+(\d+)\s*[:—–-]\s*(.+)$/i))) {
      cur = { num: +m[1], title: clean(m[2]), questions: [], claimedDraft: null };
      modules.push(cur);
      pending = null;
      continue;
    }

    // The DRAFT marker rides on the same paragraph as the source line.
    const draft = /\[DRAFT[^\]]*\]/i.test(t);
    const bare = clean(t.replace(/\[DRAFT[^\]]*\]/ig, ''));

    if ((m = bare.match(/^Source video\s*:\s*(.+)$/i))) {
      pending = { level: 'video', title: clean(m[1]), draft };
      continue;
    }
    if ((m = bare.match(/^Source\s*:\s*Module\s+(\d+)\s*,\s*Lesson\s+\d+\.(\d+)\s*[—–-]\s*(.*)$/i))) {
      pending = { level: 'lesson', module: +m[1], lesson: +m[2], title: clean(m[3]), draft };
      continue;
    }
    if (/^Source(\s+video)?\s*:/i.test(bare)) {
      warn.push(`unreadable source line: "${bare.slice(0, 70)}"`);
      pending = null;
    }
    continue;
  }

  // ---- a question table ----
  const rows = b.rows.filter(r => r.length >= 2 && ROW_LABEL.test(clean(r[0])));
  if (rows.length < 3) continue;
  if (!cur) { warn.push('question table before any module heading — skipped'); continue; }

  const q = { num: 0, sourceNum: null, prompt: '', options: [], correct: null, feedback: {},
              mapped: '', mappedLevel: '', sourceTitle: '', draft: false };
  let lastLetter = null;

  for (const cells of rows) {
    const label = clean(cells[0]).replace(/[.:]\s*$/, '').toUpperCase();
    const paras = (cells[1] || '').split('\n').map(verbatim).filter(Boolean);
    let m;
    if ((m = label.match(/^Q\s*(\d+)$/))) {
      q.sourceNum = +m[1];
      q.prompt = paras.length === 1 ? paras[0] : paras;
    } else if (/^[A-D]$/.test(label)) {
      q.options.push({ letter: label, text: paras.join(' ') });
      lastLetter = label;
    } else if (label === 'FEEDBACK') {
      if (!lastLetter) { warn.push(`M${cur.num} src-Q${q.sourceNum}: a Feedback row precedes its option`); continue; }
      if (q.feedback[lastLetter]) warn.push(`M${cur.num} src-Q${q.sourceNum}: two Feedback rows for option ${lastLetter}`);
      q.feedback[lastLetter] = paras.join(' ');
    }
  }

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num} (source Q${q.sourceNum})`;

  // The "(Correct)" marker is the answer key — nothing else in this document states it.
  const marked = Object.entries(q.feedback)
    .filter(([, fb]) => /^\(Correct\)/i.test(fb)).map(([L]) => L);
  if (marked.length === 1) q.correct = marked[0];
  else {
    warn.push(`${where}: the answer key is the "(Correct)" marker and ${marked.length} options `
      + `carry one (${marked.join(', ') || 'none'}) — the question has no usable key`);
  }

  if (pending) {
    q.draft = pending.draft;
    q.sourceTitle = pending.title;
    if (pending.level === 'video') {
      q.mapped = resolveVideoTitle(pending.title, cur.num, where);
      q.mappedLevel = q.mapped ? 'video' : '';
    } else {
      if (pending.module !== cur.num) {
        warn.push(`${where}: its source line names module ${pending.module} from inside module ${cur.num}`);
      }
      const les = (MMETA['M' + pending.module] || { lessons: {} }).lessons[pending.lesson];
      if (!les) warn.push(`${where}: the outline has no Module ${pending.module} Lesson ${pending.lesson}`);
      else {
        q.mapped = `M${pending.module}L${pending.lesson}`;
        q.mappedLevel = 'lesson';
        if (pending.title && norm(pending.title) !== norm(les.title)) {
          warn.push(`${where}: quiz calls ${q.mapped} "${pending.title}" but the outline calls it `
            + `"${les.title}" — the reference line will use the outline's wording`);
        }
      }
    }
  } else {
    warn.push(`${where}: no source line above the question`);
  }
  pending = null;

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (q.correct && !q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }
  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no feedback for ${missing.join(', ')}`);
  for (const [L, fb] of Object.entries(q.feedback)) {
    if (!/^\((Correct|Incorrect)\)/i.test(fb)) {
      warn.push(`${where}: feedback ${L} does not open with a (Correct)/(Incorrect) marker: "${fb.slice(0, 40)}"`);
    }
  }
  if (!q.mapped) warn.push(`${where}: unmapped — the builder cannot write a reference line for it`);
  promptLines.forEach((line, i) => {
    const text = i === 0 ? String(line).replace(/^\s*Scenario\s*:\s*/i, '') : line;
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(text)) {
      warn.push(`${where}: prompt line ${i + 1} starts with a label-like token: "${text.slice(0, 40)}"`);
    }
  });

  cur.questions.push(q);
}

// The notice's own numbers, and each module's, against what the tables hold.
const all = modules.flatMap(mo => mo.questions);
const drafts = all.filter(q => q.draft).length;
if (notice.draft !== null && notice.draft !== drafts) {
  warn.push(`the sourcing notice says ${notice.draft} questions are DRAFT; ${drafts} carry the marker`);
}
if (notice.transcript !== null && notice.transcript !== all.length - drafts) {
  warn.push(`the sourcing notice says ${notice.transcript} questions come from transcripts; `
    + `${all.length - drafts} carry no DRAFT marker`);
}
for (const mo of modules) {
  const d = mo.questions.filter(q => q.draft).length;
  if (mo.claimedDraft !== null && mo.claimedDraft !== d) {
    warn.push(`Module ${mo.num}: its notice says ${mo.claimedDraft} DRAFT questions, ${d} carry the marker`);
  }
  delete mo.claimedDraft;
}
if (drafts) {
  warn.push(`${drafts} of ${all.length} questions are DRAFT — written from titles alone, not from a `
    + 'transcript, and unverified. Every one needs SME review against the recorded lesson before '
    + 'publishing. They are listed per module in each document\'s working area.');
}

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const d = mo.questions.filter(q => q.draft).length;
    const lvl = mo.questions.filter(q => q.mappedLevel === 'video').length;
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${lvl} mapped to a video, ${mo.questions.length - lvl} to a lesson, ${d} DRAFT`);
  });
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(q => q.mapped).length} mapped · `
    + `${all.filter(q => q.mappedLevel === 'video').length} to a video, `
    + `${all.filter(q => q.mappedLevel === 'lesson').length} to a lesson only · `
    + `${all.reduce((a, q) => a + Object.keys(q.feedback).length, 0)} feedback blocks`);
  console.log(`sourcing notice: ${notice.captioned}/${notice.videos} videos captioned, `
    + `${notice.transcript} from transcripts, ${notice.draft} DRAFT`);
  const byLetter = {};
  for (const q of all) byLetter[q.correct] = (byLetter[q.correct] || 0) + 1;
  console.log('answer key spread: ' + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}

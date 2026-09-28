// Parser for the Deploying and Orchestrating AI Agents outline (IBM Course Syllabus) —
// quiz-pipeline side. Emits outline.json: module/lesson titles, the M<x>L<y>V<z> -> video-title
// map, and — new for this course — an ASSET INDEX covering every learning item in the syllabus,
// not only the videos.
//
// Why the asset index exists. Every other course in this repo cites its videos by code
// ("Mapped to: M1L1V2"), so a video map was enough. This source cites them by TITLE, on an
// "Asset:" line above each question, and roughly a quarter of the 110 questions cite a Reading,
// a Lab or an FAQ rather than a video:
//
//     Asset: Video: How Agents Pass Work to Each Other; Reading: A Coordination Patterns Reference
//     Asset: Lab: Map a Coordination Pattern
//
// A "Refer to Module 1 Lesson 1 Video 2:" line on a question whose source cites a Lab would be
// simply wrong, so the reference the builder writes names whatever the source named. That needs
// every asset title resolvable to its module and lesson, which is what `assets` below is.
//
// SOURCE SHAPE. Unlike every previous outline this one is a FLAT BULLET DOCUMENT, not a table:
// "Module N (Planned duration…)" / "Title" / <title> / "Module-Level Learning Objectives" /
// "Assets" / "Lesson N: <title>" / "•<Kind>: <title> (<n> mins)". lib-lines reads it directly;
// lib-outline-course, which reads table rows, does not apply here.
//
// V-NUMBERING follows agile-pm's rule — only a row labelled exactly "Video" takes a number.
// "Demo Video", "SME Interview" and "Day-in-the-Life Video" are indexed as assets under their
// own labels but never consume a V number, so M1L3V3 stays the third animated video of the
// lesson whether or not the demo sits between them.
//
// There is no "Lead Instructor:" line, as in agile-pm, so a reported placeholder is emitted.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'deploying-ai-agents';
const raw = lines(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const INSTRUCTOR_PLACEHOLDER = '[Lead Instructor Name]';

const map = {};      // "M1L1V1" -> {video, module, lesson, moduleTitle, lessonTitle}
const assets = {};   // normalised title -> {kind, label, module, lesson, code, title, ...}
const index = {};    // normalised video title -> [code, ...]
const meta = {};     // "M1" -> {title, description, los:[], lessons:{1:{title, assets:[]}}}
const course = {
  title: '', subtitle: '', instructor: '', instructorIsPlaceholder: false,
  los: {}, quizzes: {},
};
const warn = [];
const notes = [];

// Matching-only normalisation: case, curly quotes, dashes, ampersands, inner spacing.
// Deliberately lossy — never write the result back into a document.
const norm = s => String(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// Leading bullet glyphs and the whitespace after them. The document mixes real bullet runs
// (•, ○, ▪) with Word list numbering that emits no glyph at all, so this only strips what
// is there and the KIND match below is what actually decides whether a line is an asset.
const debullet = s => String(s).replace(/^[•○▪◦·*\-\s]+/, '').trim();

// The asset kinds this syllabus uses, longest first so "Demo Video" wins over "Video".
// Each maps to the label the reference line will carry. Videos are the only kind that takes
// a V number; the rest are referenced by kind and title alone.
const KINDS = [
  ['Day-in-the-Life Video', 'Day-in-the-Life Video'],
  ['Downloadable Resource', 'Downloadable Resource'],
  ['Discussion Prompt', 'Discussion Prompt'],
  ['Cumulative Project', 'Cumulative Project'],
  ['Expert Viewpoint', 'Expert Viewpoint'],
  ['SME Interview', 'SME Interview'],
  ['Practice Quiz', 'Practice Quiz'],
  ['Demo Video', 'Demo Video'],
  ['Graded Quiz', 'Graded Quiz'],
  ['Final Exam', 'Final Exam'],
  ['Reading', 'Reading'],
  ['Video', 'Video'],
  ['Lab', 'Lab'],
  ['FAQ', 'FAQ'],
];
const KIND_RE = new RegExp('^(' + KINDS.map(([k]) => k.replace(/[-]/g, '\\-')).join('|') + ')\\s*:\\s*(.+)$', 'i');
const canonKind = k => (KINDS.find(([n]) => n.toLowerCase() === String(k).toLowerCase()) || [k, k])[1];

// Source kinds that are NOT Coursera item types, and what a learner-facing reference should
// call them instead. An FAQ is published as a Reading, so the reference says "Reading:" and
// carries the FAQ designation in the title where the syllabus itself puts it. Add a row here
// rather than special-casing a kind anywhere downstream.
const REFERENCE_AS = {
  FAQ: { label: 'Reading', titlePrefix: 'FAQ: ' },
};

// "(7 mins)", "(5 questions / 10 mins)", "(30 mins)" — trailing budget, kept as metadata and
// removed from the title. The title is what the quizzes cite, and they cite it without it.
function splitBudget(text) {
  const m = /^(.*?)\s*\((?:(\d+)\s*questions?\s*\/\s*)?~?\s*(\d+)\s*(?:mins?|minutes?)[^)]*\)\s*$/i.exec(text);
  if (!m) return { title: text.trim(), minutes: null, questions: null };
  return {
    title: m[1].trim(),
    questions: m[2] ? Number(m[2]) : null,
    minutes: Number(m[3]),
  };
}

// ---------- course-level header ----------
{
  const i = raw.findIndex(l => /^Course Syllabus$/i.test(l));
  if (i >= 0) {
    const t = raw.slice(i + 1).find(l => l.trim());
    if (t && !/^Estimated Course Duration/i.test(t)) course.title = t.trim();
  }
  if (!course.title) warn.push('no course title found under the "Course Syllabus" heading');

  const s = raw.findIndex(l => /^What You Will Learn$/i.test(l));
  if (s < 0) {
    warn.push('no "What You Will Learn" section — the course-level objectives will be empty and '
      + 'the Guide Section of every built document will have no Learning Objective entries');
  } else {
    let n = 0;
    for (let j = s + 1; j < raw.length; j++) {
      const l = raw[j];
      if (/^Course Description$/i.test(l)) break;
      if (!l.trim() || /^By the end of this course/i.test(l)) continue;
      const t = debullet(l);
      if (!t) continue;
      course.los['LO' + (++n)] = t;
    }
    if (!n) warn.push('"What You Will Learn" lists no objectives');
  }

  const inst = raw.find(l => /^Lead Instructor\s*:/i.test(l));
  course.instructor = inst ? inst.split(':').slice(1).join(':').trim() : '';
}

// ---------- modules ----------
const MODULE_HEAD = /^Module\s+(\d+)\s*\(Planned duration/i;
const LESSON_HEAD = /^Lesson\s+(\d+)\s*:\s*(.+)$/i;

const modStarts = [];
raw.forEach((l, i) => { const m = MODULE_HEAD.exec(l); if (m) modStarts.push({ num: Number(m[1]), i }); });
if (!modStarts.length) throw new Error('no "Module N (Planned duration…)" headings found in the outline');

for (let mi = 0; mi < modStarts.length; mi++) {
  const { num, i: start } = modStarts[mi];
  const end = mi + 1 < modStarts.length ? modStarts[mi + 1].i : raw.length;
  const block = raw.slice(start, end);
  const key = 'M' + num;
  const M = meta[key] = { num, title: '', description: '', los: [], lessons: {} };

  // Title / Module Description sit on the line after their own label line.
  const after = label => {
    const j = block.findIndex(l => new RegExp('^' + label + '$', 'i').test(l.trim()));
    if (j < 0) return '';
    for (let k = j + 1; k < block.length; k++) if (block[k].trim()) return block[k].trim();
    return '';
  };
  M.title = after('Title');
  M.description = after('Module Description');
  if (!M.title) warn.push(`${key}: no module title under the "Title" label`);

  {
    const j = block.findIndex(l => /^Module-Level Learning Objectives$/i.test(l.trim()));
    if (j < 0) warn.push(`${key}: no "Module-Level Learning Objectives" section`);
    else {
      for (let k = j + 1; k < block.length; k++) {
        if (/^Assets$/i.test(block[k].trim())) break;
        if (!block[k].trim() || /^By the end of this module/i.test(block[k])) continue;
        const t = debullet(block[k]);
        if (t) M.los.push(t);
      }
      if (!M.los.length) warn.push(`${key}: the learning-objectives section lists nothing`);
    }
  }

  // ---- assets, lesson by lesson ----
  const aStart = block.findIndex(l => /^Assets$/i.test(l.trim()));
  if (aStart < 0) { warn.push(`${key}: no "Assets" section — no lessons or videos recorded`); continue; }

  let lesson = null;       // current lesson number
  let vCount = 0;          // videos seen in the current lesson
  // "Cumulative Project Details" and anything after it is project scaffolding, not lesson assets.
  for (let k = aStart + 1; k < block.length; k++) {
    const line = block[k];
    if (/^Cumulative Project Details$/i.test(line.trim())) break;
    const lh = LESSON_HEAD.exec(line.trim());
    if (lh) {
      lesson = Number(lh[1]);
      vCount = 0;
      M.lessons[lesson] = { title: lh[2].trim(), assets: [] };
      continue;
    }
    if (lesson === null) continue;
    const km = KIND_RE.exec(debullet(line));
    if (!km) continue;
    const kind = canonKind(km[1]);
    const { title, minutes, questions } = splitBudget(km[2]);
    if (!title) continue;

    const rec = { kind, module: num, lesson, title, minutes, questions, code: null };
    if (kind === 'Video') {
      const code = `${key}L${lesson}V${++vCount}`;
      rec.code = code;
      map[code] = {
        video: title, module: num, lesson,
        moduleTitle: M.title, lessonTitle: M.lessons[lesson].title,
      };
      (index[norm(title)] = index[norm(title)] || []).push(code);
    }
    // The reference label and display title the builder writes. Module and lesson are
    // prefixed by the builder.
    //
    // THE VIDEO NUMBER IS NOT IN THE LABEL, at the course owner's request:
    //     Refer to Module 1 Lesson 3 Video: Testing the Workflow as a Whole
    // not "Video 3:". The title already identifies the video, and every asset kind reads the
    // same way — "Video:", "Reading:", "Lab:". The V number is still derived and still stored
    // as `code` (M1L3V3), because that is what orders the assets within a lesson and what the
    // parsers' checks are written against; it just does not reach the learner.
    //
    // THE LABEL IS THE ITEM TYPE THE LEARNER SEES, not the syllabus' own word for it. An FAQ
    // is not a Coursera item type — it is published as a Reading — so it is labelled
    // "Reading:" and keeps its own designation inside the title, exactly as the syllabus
    // writes it:
    //     Refer to Module 1 Lesson 1 Reading: FAQ: When Two Agents Both Think They Own the Same Step
    // The title stays bare in `title`, which is the matching key the quizzes resolve against;
    // only the displayed form carries the prefix.
    const as = REFERENCE_AS[kind];
    rec.label = as ? as.label : kind;
    rec.titlePrefix = as ? as.titlePrefix : '';
    M.lessons[lesson].assets.push(rec);

    // Quizzes are indexed too, but under their own bucket — they are the documents being
    // built, not things a learner is sent back to.
    if (kind === 'Practice Quiz' || kind === 'Graded Quiz' || kind === 'Final Exam') {
      course.quizzes[`${key}L${lesson}:${kind}`] = { module: num, lesson, kind, title, minutes, questions };
      continue;
    }

    const nk = norm(title);
    if (assets[nk] && assets[nk].kind === kind &&
        (assets[nk].module !== num || assets[nk].lesson !== lesson)) {
      notes.push(`"${title}" (${kind}) appears in M${assets[nk].module}L${assets[nk].lesson} and `
        + `M${num}L${lesson}; a quiz citing it by title alone resolves to the first`);
    }
    if (!assets[nk]) assets[nk] = rec;
  }

  const nl = Object.keys(M.lessons).length;
  if (!nl) warn.push(`${key}: the Assets section contains no "Lesson N:" heading`);
}

// ---------- checks ----------
if (!course.instructor) {
  course.instructor = INSTRUCTOR_PLACEHOLDER;
  course.instructorIsPlaceholder = true;
  warn.push('no "Lead Instructor:" line in the outline — the Guide Section of every built '
    + `document will read "${INSTRUCTOR_PLACEHOLDER}". Fill it in before publishing.`);
}
for (const [k, codes] of Object.entries(index)) {
  if (codes.length > 1) {
    notes.push(`${codes.length} videos share the title "${map[codes[0]].video}" (${codes.join(', ')}) — `
      + 'a quiz citing it by title alone resolves to the first');
  }
}
for (const [k, M] of Object.entries(meta)) {
  for (const [n, L] of Object.entries(M.lessons)) {
    const v = L.assets.filter(a => a.kind === 'Video').length;
    if (n !== '0' && k !== 'M5' && v !== 3) {
      warn.push(`${k} Lesson ${n} has ${v} numbered video${v === 1 ? '' : 's'}; every teaching `
        + 'lesson in this syllabus is built on three, so check the V numbering for this lesson');
    }
  }
}

if (process.argv.includes('--report')) {
  console.log(course.title);
  console.log(`instructor: ${course.instructor}${course.instructorIsPlaceholder ? '  (placeholder)' : ''}`);
  for (const k of Object.keys(meta).sort((a, b) => +a.slice(1) - +b.slice(1))) {
    const M = meta[k];
    console.log(`\n  ${k} — ${M.title}   (${M.los.length} objectives)`);
    for (const n of Object.keys(M.lessons).sort((a, b) => +a - +b)) {
      const L = M.lessons[n];
      const by = {};
      L.assets.forEach(a => { by[a.kind] = (by[a.kind] || 0) + 1; });
      console.log(`    Lesson ${n}: ${L.title}`);
      console.log(`        ${Object.entries(by).map(([x, c]) => `${c} ${x}`).join(' · ') || 'no assets'}`);
      L.assets.filter(a => a.code).forEach(a => console.log(`        ${a.code}  ${a.title}`));
    }
  }
  const nq = Object.keys(course.quizzes).length;
  console.log(`\n${Object.keys(meta).length} modules · ${Object.keys(map).length} numbered videos · `
    + `${Object.keys(assets).length} referenceable assets · ${Object.keys(course.los).length} course `
    + `objectives · ${nq} quizzes declared`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
  console.log(`notes: ${notes.length}`);
  notes.forEach(n => console.log('  ' + n));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(n => console.error('NOTE ' + n));
  console.log(JSON.stringify({ map, assets, index, meta, course }, null, 2));
}

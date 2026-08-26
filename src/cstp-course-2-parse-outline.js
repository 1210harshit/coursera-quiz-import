// Outline parser scoped to COURSE 2 only — quiz-pipeline side.
//
// The source holds four courses in one document. Capture starts at the "Course 2" heading and
// stops at "Course 3", exactly as cstp-course-1-parse-outline.js does for the first course.
// Modules and lessons share a heading level here, so they are told apart by text.
//
// Two things differ from the Course 1 parser:
//
//   * objective ids are C2LO<n>, and all three are written in ONE paragraph separated by
//     <w:br/>. paraText therefore turns a break into a newline and each line is matched
//     separately; reading the paragraph as a single string would run them together as
//     "…initiatives.C2LO2: Influence…".
//   * each module states its aligned objective WITH the text inline ("C2LO1 - Construct
//     persuasive narratives…"), where Course 1 sometimes leaves the value blank and puts the
//     id on the next line. Only the id is kept — the text comes from the course-level list, so
//     there is one source of truth for the wording.
//
// The Lead Instructor is stated once for the whole series, before the Course 1 heading, so it
// is picked up outside the Course 2 scope.
const fs = require('fs');
const path = require('path');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'cstp-course-2';
const COURSE_NO = 2;
const LO_PREFIX = `C${COURSE_NO}LO`;

const xml = fs.readFileSync(path.join(SP, SLUG, 'outline', 'word', 'document.xml'), 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// <w:br/> becomes a newline: this outline puts all three course objectives in one paragraph.
// The break must be matched alongside the text, not substituted into the XML beforehand — it
// sits between runs, so a substituted newline would land outside the <w:t> elements and vanish.
function paraText(p) {
  let out = '';
  for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/?>|<w:tab\s*\/?>/g)) {
    out += m[1] !== undefined ? dec(m[1]) : (m[0].startsWith('<w:tab') ? ' ' : '\n');
  }
  return out;
}
const lines = s => s.split('\n').map(clean).filter(Boolean);

const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
const blocks = [];
for (const bm of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)) {
  const b = bm[0];
  if (!b.startsWith('<w:tbl')) { blocks.push({ type: 'p', text: clean(paraText(b)), raw: paraText(b) }); continue; }
  const rows = [];
  for (const rm of b.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = [];
    for (const cm of rm[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)) {
      // Cell text is content: trim the ends, keep runs of spaces inside. See lib-outline-course.
      const ps = [...cm[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)]
        .map(p => paraText(p[0]).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, ''))
        .filter(x => x.trim());
      cells.push(ps.join('\n'));
    }
    rows.push(cells);
  }
  blocks.push({ type: 'table', rows });
}

const map = {};
const meta = {};
const index = {};
const course = { title: '', instructor: '', los: {}, quizMinutes: null, quizClaimedQuestions: null };
const warn = [];

const norm = s => clean(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ').replace(/[.,:;]+$/, '').replace(/\s+/g, ' ').toLowerCase();

let inCourse = false, mod = null, les = null;

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;

    // Stated once for the whole series, before any course heading.
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)) && !course.instructor) course.instructor = m[1].trim();

    if (new RegExp(`^Course\\s*${COURSE_NO}\\b`, 'i').test(t)) { inCourse = true; mod = les = null; continue; }
    if (/^Course\s*\d+\b/i.test(t) && inCourse) break;         // the next course ends the scope
    if (!inCourse) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.+)$/i))) { course.title = m[1].trim(); continue; }

    // All three objectives arrive in one break-separated paragraph.
    if (b.raw && new RegExp(`${LO_PREFIX}\\d+`, 'i').test(b.raw)) {
      let found = false;
      for (const line of lines(b.raw)) {
        const lm = line.match(new RegExp(`^(${LO_PREFIX}\\d+)\\s*[:\\-–]\\s*(.+)$`, 'i'));
        if (lm) { course.los[lm[1].toUpperCase()] = lm[2].trim(); found = true; }
      }
      if (found) continue;
    }

    if (/^Introduction to Course/i.test(t)) { mod = les = null; continue; }
    if (/^Supplementary Items/i.test(t))    { mod = les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) { meta['M' + mod].title = m[1].trim(); continue; }

    // "Aligned Course-level Learning Objective: C2LO1 - <text>" — only the id is kept; the
    // wording comes from the course-level list so there is one source of truth for it.
    if ((m = t.match(new RegExp(`^(?:•\\s*)?Aligned Course-level Learning Objectives?\\s*:\\s*(${LO_PREFIX}\\d+)`, 'i'))) && mod) {
      meta['M' + mod].alignedLOs = [m[1].toUpperCase()];
      continue;
    }

    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      les = +m[1];
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      continue;
    }
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && mod && les) {
      meta['M' + mod].lessons[les].title = m[1].trim();
      continue;
    }
    continue;
  }

  if (!inCourse) continue;

  for (const cells of b.rows) {
    if (cells.length >= 5 && /^Graded Quiz$/i.test(clean(cells[0]))) {
      const mm = clean(cells[4]).match(/(\d+)\s*min/i);
      if (mm) course.quizMinutes = +mm[1];
      const qq = clean(cells[3]).match(/(\d+)\s*(?:multiple[- ]choice\s*)?questions?\b/i);
      if (qq) course.quizClaimedQuestions = +qq[1];
    }
  }

  if (!mod || !les) continue;
  for (const cells of b.rows) {
    if (cells.length < 2) continue;
    const m = clean(cells[0]).match(/^Video\s+(\d+)$/i);
    if (!m) continue;
    const key = `M${mod}L${les}V${m[1]}`;
    // Some modules repeat the item label inside the title cell ("Video 1: Understanding …").
    // The reference line already states the video, so the prefix is dropped.
    const title = clean(cells[1]).replace(/^Video\s*\d+\s*:\s*/i, '').trim();
    if (map[key]) { warn.push(`duplicate ${key}: "${title}" ignored`); continue; }
    if (!title) { warn.push(`${key}: no video title`); continue; }
    map[key] = {
      video: title, module: mod, lesson: les,
      moduleTitle: meta['M' + mod].title,
      lessonTitle: meta['M' + mod].lessons[les].title,
    };
    (index[norm(title)] = index[norm(title)] || []).push(key);
  }
}

if (!inCourse) warn.push(`no "Course ${COURSE_NO}" heading found — nothing was captured`);
if (!course.instructor) warn.push('no Lead Instructor line anywhere in the document');
for (const [k, m] of Object.entries(meta)) {
  if (!m.title) warn.push(`${k}: no "Title of the Module" line`);
  if (!m.alignedLOs) warn.push(`${k}: no aligned course-level objective`);
  else for (const lo of m.alignedLOs) {
    if (!course.los[lo]) warn.push(`${k}: aligned objective ${lo} has no text in the course objectives list`);
  }
  for (const [n, l] of Object.entries(m.lessons)) if (!l.title) warn.push(`${k} Lesson ${n}: no title line`);
}
const dupes = Object.entries(index).filter(([, ks]) => ks.length > 1);
for (const [t, ks] of dupes) warn.push(`video title used by ${ks.join(', ')}: "${t}"`);

if (process.argv.includes('--report')) {
  console.log(`Course ${COURSE_NO}: ${course.title}`);
  console.log(`Lead Instructor: ${course.instructor || '(none)'}`);
  for (const k of Object.keys(meta).sort((a, b) => +a.slice(1) - +b.slice(1))) {
    const vids = Object.keys(map).filter(v => v.startsWith(k + 'L'));
    console.log(`  ${k} — ${meta[k].title}  [${(meta[k].alignedLOs || []).join(', ')}]  `
      + `${Object.keys(meta[k].lessons).length} lessons, ${vids.length} videos`);
  }
  console.log(`\n${Object.keys(meta).length} modules · ${Object.keys(map).length} mapped videos · `
    + `${Object.keys(course.los).length} course objectives · `
    + `quiz budget ${course.quizMinutes} mins for ${course.quizClaimedQuestions} questions`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify({ map, meta, index, course }, null, 2));
}

// GenAI for Legal Teams — outline .docx -> outline.json for the quiz pipeline.
//
// Copied from cstp-course-4-parse-outline.js, which reads the same heading grammar: bare
// "Module N" / "Lesson N" paragraphs with the name on a following "Title of the Module:" /
// "Title of the Lesson:" line, and learning items in a table whose first column is the item
// kind. Four differences, all because this source holds ONE course where CSTP holds four:
//
//   * there is no "Course N" heading to scope to, so the whole body is in scope. The capture
//     range that CSTP parsers live or die by simply does not exist here.
//   * the course title line is "Course Title:", not "Title of the Course:".
//   * objective ids are plain LO<n>, stated as a bulleted list under "Learning Objectives:",
//     one per paragraph — not CSTP's three-in-one-paragraph <w:br/> block.
//   * modules state "Aligned Learning Objective: LO1", without CSTP's "Course-level".
//
// Module 1 Lesson 1 opens with an "Intro Video" row rather than "Video 1". It is deliberately
// NOT mapped: the quiz numbers its citations from the first "Video 1", so counting the intro
// would shift every key in that lesson by one. Same for the "Introduction to Entire Course"
// and "Supplementary Items for Entire Course" tables, which sit outside any lesson.
const fs = require('fs');
const path = require('path');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'genai-legal';

const xml = fs.readFileSync(path.join(SP, SLUG, 'outline', 'word', 'document.xml'), 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// <w:br/> becomes a newline. It must be matched alongside the text rather than substituted
// into the XML beforehand — a break sits between runs, so a substituted newline would land
// outside the <w:t> elements and vanish.
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
        .map(p => paraText(p[0]).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, ''))
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

const norm = s => clean(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/\s*&\s*/g, ' and ').replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ').toLowerCase();

let mod = null, les = null, section = null;

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)) && !course.instructor) { course.instructor = m[1].trim(); continue; }
    if ((m = t.match(/^Course Title\s*:\s*(.+)$/i)) && !course.title) { course.title = m[1].trim(); continue; }

    // "• LO1: Analyze complex contracts …" — one objective per bulleted paragraph.
    if ((m = t.match(/^[•·*-]?\s*(LO\d+)\s*[:\-–]\s*(.+)$/i)) && !/^Aligned/i.test(t)) {
      course.los[m[1].toUpperCase()] = m[2].trim();
      continue;
    }

    // Both sit outside any module, and their tables must not be mapped.
    if (/^Introduction to Entire Course/i.test(t)) { section = 'intro'; mod = les = null; continue; }
    if (/^Supplementary Items/i.test(t))           { section = 'supplementary'; mod = les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      section = null;
      mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) { meta['M' + mod].title = m[1].trim(); continue; }

    // "Aligned Learning Objective: LO1" — only the id is kept, so the wording has one source
    // of truth in the course-level list.
    if ((m = t.match(/^(?:[•·*-]\s*)?Aligned\s+(?:Course-level\s+)?Learning Objectives?\s*:\s*(LO\d+)/i)) && mod) {
      meta['M' + mod].alignedLOs = [m[1].toUpperCase()];
      continue;
    }

    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      section = null;
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

  for (const cells of b.rows) {
    if (cells.length >= 5 && /^Graded Quiz$/i.test(clean(cells[0]))) {
      const mm = clean(cells[4]).match(/(\d+)\s*min/i);
      if (mm) course.quizMinutes = +mm[1];
      const qq = clean(cells[3]).match(/(\d+)\s*(?:multiple[- ]choice\s*)?questions?\b/i);
      if (qq) course.quizClaimedQuestions = +qq[1];
    }
  }

  if (!mod || !les || section) continue;
  for (const cells of b.rows) {
    if (cells.length < 2) continue;
    const label = clean(cells[0]);
    const m = label.match(/^Video\s+(\d+)$/i);
    if (!m) {
      // "Intro Video" is a real row that the quiz never cites and must not take a V-number;
      // say so rather than letting it vanish into the unmatched pile.
      if (/^Intro\s+Video$/i.test(label)) continue;
      continue;
    }
    const key = `M${mod}L${les}V${m[1]}`;
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

if (!course.title) warn.push('no "Course Title:" line found');
if (!course.instructor) warn.push('no Lead Instructor line anywhere in the document');
if (!Object.keys(meta).length) warn.push('no "Module N" heading found — nothing was captured');
for (const [k, m] of Object.entries(meta)) {
  if (!m.title) warn.push(`${k}: no "Title of the Module" line`);
  if (!m.alignedLOs) warn.push(`${k}: no aligned learning objective`);
  else for (const lo of m.alignedLOs) {
    if (!course.los[lo]) warn.push(`${k}: aligned objective ${lo} has no text in the course objectives list`);
  }
  for (const [n, l] of Object.entries(m.lessons)) if (!l.title) warn.push(`${k} Lesson ${n}: no title line`);
}
const dupes = Object.entries(index).filter(([, ks]) => ks.length > 1);
for (const [t, ks] of dupes) warn.push(`video title used by ${ks.join(', ')}: "${t}"`);

if (process.argv.includes('--report')) {
  console.log(course.title);
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

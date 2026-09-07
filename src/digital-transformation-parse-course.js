// Digital Transformation Foundation and Strategy (Course 1) — outline .docx -> course.json for
// the course-content importer. Course 1 only; the source carries four.
//
// Source shape is cstp-course-1's: bare "Module N" / "Lesson N" headings with the name on a
// following "Title of the Module:" / "Title of the Lesson:" line, one document holding four
// courses so capture runs from "Course 1" to "Course 2", C1LO objectives, and an
// "Introduction to Course 1" / "Supplementary Items for Course 1" pair of course-level tables
// that Coursera has nowhere to put and which are therefore folded into lessons.
//
// It reads its blocks from lib-outline-nested rather than lib-outline-course. This outline
// nests its learning-items tables three deep, and the shared reader's non-greedy
// `<w:tbl>…</w:tbl>` match stops at the first inner close, truncating every outer table and
// spilling the rest of its rows into the body as loose paragraphs — 177 fragments where there
// are 44 tables. Nothing errors; the course simply comes out mostly empty. See the header of
// lib-outline-nested.js. The two readers agree byte for byte on a source without nesting.
//
// "Description:" appears in three forms here and all three are read: the text inline after the
// colon, the text after a line break in the same paragraph, and the label alone with the text
// in the paragraphs that follow. The last is the commonest, and reading only the first two —
// which is what a `(.+)$` pattern does, since `.` does not match a newline — silently produces
// modules with no description at all.
//
// Durations are stated everywhere except one Role Play Activity, which takes the value its two
// siblings state. DPQ rows price "5 mins each" against "2 open-ended questions", so the cell is
// multiplied out the way cstp-course-1 does it.
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-nested');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'digital-transformation';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const ROLE_PLAY_DEFAULT = 15;      // the two role plays that do state a time both say 15
const DEFAULT_MINUTES = 5;
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';

// Ends a run of description paragraphs. Anything that opens a new section of the outline.
const DESC_END = /^(Aligned|Module\s+\d|Lesson\s+\d|Title of|Learning Objectives|Introduction to|Supplementary Items|Course\s+\d|Program|PART\s)/i;

const course = { title: '', description: '', offeringType: 'Private', sme: '', modules: [] };
const intro = [];
const wrapUp = [];

let inCourse1 = false, section = null, mod = null, les = null;
let context = null;                // 'course' | 'module' | 'lesson' — whose Description: is next
let collecting = null;             // 'course' | 'module' — currently gathering description text
let awaitLO = null;                // "C1LO1" — its text is on the following paragraph
let programTitle = '';

const courseDesc = [];
const moduleDesc = [];
const courseLOs = {};              // "C1LO1" -> text
let alignedPLO = '', awaitPLO = false;

const flushModuleDesc = () => {
  if (mod && moduleDesc.length && !mod.description) mod.description = moduleDesc.join('\n\n');
  moduleDesc.length = 0;
};

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    // ---- program level, stated once above the Course 1 heading ----
    if ((m = t.match(/^Program Title\s*[:\-–]\s*(.+)$/i)) && !programTitle) {
      programTitle = m[1].replace(/^[_\s]+/, '').trim(); continue;
    }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)) && !course.sme) { course.sme = m[1].trim(); continue; }

    if (/^Course\s*1\s*$/i.test(t)) {
      inCourse1 = true; section = null; mod = les = null; context = 'course'; continue;
    }
    if (/^Course\s*[2-9]\d*\s*$/i.test(t)) { flushModuleDesc(); break; }   // Course 1 only
    if (!inCourse1) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.*)$/i))) {
      if (m[1].trim()) course.title = m[1].trim();
      else warnings.push('"Title of the Course:" line is empty');
      context = 'course'; continue;
    }

    // "C1LO2: <text>", or the id alone with the text on the next paragraph. A <w:br/> inside
    // the paragraph arrives as a newline, so the inline form may carry its text after one.
    if ((m = t.match(/^(?:•\s*)?(C1LO\d+)\s*:\s*([\s\S]*)$/i))) {
      collecting = null;
      const id = m[1].toUpperCase(), text = m[2].replace(/\s+/g, ' ').trim();
      if (text) { courseLOs[id] = text; awaitLO = null; }
      else { courseLOs[id] = ''; awaitLO = id; }
      continue;
    }
    if (awaitLO && !DESC_END.test(t)) {
      courseLOs[awaitLO] = t.replace(/^•\s*/, '').replace(/\s+/g, ' ').trim();
      awaitLO = null; continue;
    }

    if ((m = t.match(/^Aligned Program-level Learning Objectives?\s*:\s*([\s\S]*)$/i))) {
      collecting = null;
      const v = m[1].replace(/\s+/g, ' ').trim();
      if (v) alignedPLO = v; else awaitPLO = true;
      continue;
    }
    if (awaitPLO && /^PLO\d/i.test(t)) { alignedPLO = t.replace(/\s+/g, ' ').trim(); awaitPLO = false; continue; }

    if (/^Introduction to Course/i.test(t)) {
      flushModuleDesc(); collecting = null; section = 'intro'; mod = les = null; context = null; continue;
    }
    if (/^Supplementary Items/i.test(t)) {
      flushModuleDesc(); collecting = null; section = 'supplementary'; mod = les = null; context = null; continue;
    }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      flushModuleDesc(); collecting = null; section = null;
      mod = { number: m[1], name: '', description: '', objectives: [], lessons: [] };
      course.modules.push(mod);
      les = null; context = 'module';
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.*)$/i)) && mod) {
      if (m[1].trim()) mod.name = m[1].trim();
      else warnings.push(`Module ${mod.number}: "Title of the Module:" line is empty`);
      context = 'module'; continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      flushModuleDesc(); collecting = null; section = null;
      les = { number: m[1], name: '', items: [] };
      mod.lessons.push(les);
      context = 'lesson'; continue;
    }
    // Lesson numbering restarts at 1 inside every module and the number stays in the name.
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.*)$/i)) && les) {
      if (m[1].trim()) les.name = `Lesson ${les.number}: ${m[1].trim()}`;
      else warnings.push(`Module ${mod.number} Lesson ${les.number}: "Title of the Lesson:" line is empty`);
      context = 'lesson'; continue;
    }
    if ((m = t.match(/^(?:•\s*)?Aligned Course-level Learning Objectives?\s*:?\s*([\s\S]*)$/i)) && mod) {
      collecting = null;
      const v = m[1].replace(/\s+/g, ' ').trim();
      if (v) mod.alignedLO = v; else mod._awaitLO = true;
      continue;
    }
    if (mod && mod._awaitLO && /^C1LO\d/i.test(t)) {
      mod.alignedLO = t.replace(/\s+/g, ' ').trim(); mod._awaitLO = false; continue;
    }

    // ---- Description:, in all three forms ----
    if ((m = t.match(/^Description\s*:\s*([\s\S]*)$/i))) {
      const rest = m[1].replace(/^\s*\n/, '').trim();
      collecting = context === 'module' ? 'module' : context === 'course' ? 'course' : null;
      if (rest) {
        if (collecting === 'module') moduleDesc.push(rest);
        else if (collecting === 'course') courseDesc.push(rest);
      }
      continue;
    }
    if (collecting) {
      if (DESC_END.test(t)) { collecting = null; continue; }
      // The source leaves stray punctuation-only paragraphs between blocks.
      if (/^[.\s•]*$/.test(t)) continue;
      (collecting === 'module' ? moduleDesc : courseDesc).push(t);
      continue;
    }
    continue;
  }

  // --- learning-items table ---
  if (!inCourse1) continue;
  flushModuleDesc();
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  const target = section === 'intro' ? intro : section === 'supplementary' ? wrapUp : les && les.items;
  if (!target) { warnings.push(`items table outside any lesson, skipped: ${rows[1] && rows[1][1]}`); continue; }

  for (const cells of rows.slice(1)) {
    const [label, title, format, desc, est, link] = cells.map(cellText);
    if (!label && !title && !desc) continue;                   // spacer row
    const type = itemType(label);
    if (!type) { warnings.push(`unrecognised item label "${label}" — skipped`); continue; }

    let min = minutes(est);
    if (min === null) {
      min = type === 'Roleplay' ? ROLE_PLAY_DEFAULT : DEFAULT_MINUTES;
      warnings.push(`M${mod ? mod.number : '?'} ${label} "${(title || desc).slice(0, 42)}": `
        + `no Est. Time in source, assumed ${min} mins`);
    }
    // "5 mins each" against "2 open-ended questions" is per question, not per item.
    if (type === 'Discussion Prompt' && /each/i.test(est || '')) {
      const n = (desc.match(/(\d+)\s*open[- ]ended/i) || [])[1];
      min *= n ? +n : 2;
    }

    // An instructional video is a numbered lesson row. "Intro Video" (the module opener) and
    // the course-level welcome and wrap-up carry no in-video question.
    const instructional = type === 'Video' && /^video\s*\d+$/i.test(clean(label)) && section === null;

    // The DPQ rows state no title, and "DPQ" is three characters — under the five Coursera
    // needs before it silently drops the row. The item kind is the only name available.
    const name = title || (type === 'Discussion Prompt' ? 'Discussion Prompt' : label);
    if (!title) warnings.push(`${label}${mod ? ` (M${mod.number}${les ? ' L' + les.number : ''})` : ''}: `
      + `no Learning Item Title in source — named "${name}"`);

    target.push({
      type,
      name,
      desc,
      min,
      ivq: instructional ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: `Outline: ${section === 'intro' ? 'Introduction to Course 1'
            : section === 'supplementary' ? 'Supplementary Items for Course 1'
            : `C1 M${mod.number} L${les.number}`} – ${label}`,
    });
  }
}
flushModuleDesc();

// --- fold the two course-level tables into lessons ----------------------------------------
if (intro.length) {
  const first = course.modules[0] && course.modules[0].lessons[0];
  if (first) first.items.unshift(...intro);
  else warnings.push('course intro items found but module 1 has no lesson to hold them');
}
if (wrapUp.length) {
  const last = course.modules[course.modules.length - 1];
  if (last) {
    const n = last.lessons.length + 1;
    last.lessons.push({ number: String(n), name: `Lesson ${n}: ${WRAPUP_LESSON}`, items: wrapUp });
  } else warnings.push('supplementary items found but there are no modules');
}

// --- course description --------------------------------------------------------------------
if (programTitle) courseDesc.unshift(`Course 1 of the ${programTitle} program.`, '');
const loIds = Object.keys(courseLOs).sort();
if (loIds.length) {
  courseDesc.push('', 'By the end of this course, you will be able to:',
    ...loIds.map(id => '• ' + courseLOs[id]));
}
if (alignedPLO) courseDesc.push('', `Aligned program learning objective: ${alignedPLO}`);
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();

// --- module objectives ------------------------------------------------------------------
for (const m of course.modules) {
  if (m.alignedLO) {
    m.objectives = [m.alignedLO.replace(/^C1LO\d+\s*[-–—]\s*/i, '').trim()];
    m.description += `\n\nAligned course learning objective: ${m.alignedLO}`;
  } else {
    m.objectives = [];
    warnings.push(`Module ${m.number}: no aligned learning objective in source`);
  }
  delete m.alignedLO;
  delete m._awaitLO;
  if (!m.name) warnings.push(`Module ${m.number}: no "Title of the Module" line`);
  if (!m.description) warnings.push(`Module ${m.number}: no description in source`);
  for (const l of m.lessons) if (!l.name) warnings.push(`Module ${m.number} Lesson ${l.number}: no title line`);
}
for (const [id, text] of Object.entries(courseLOs)) {
  if (!text) warnings.push(`${id} is stated with no objective text`);
}
if (!course.sme) warnings.push('no "Lead Instructor:" line in the outline — the course SME is left blank');

// The outline plans one in-video question per numbered lesson video, three in each of nine
// lessons. Reported whenever the parse does not produce exactly that.
{
  const items = course.modules.flatMap(m => m.lessons.flatMap(l => l.items));
  const ivqs = items.filter(i => i.ivq).length;
  if (ivqs !== 27) {
    warnings.push(`${ivqs} in-video questions, but the outline carries 27 numbered lesson videos `
      + '— check which rows were counted as instructional');
  }
}

writeJson(course, warnings);

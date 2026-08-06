// CSTP Course 1, "Foundations of Technical Communication" — outline .docx -> course.json
// for the course-content importer. Course 1 only; the source carries four.
//
// Source shape differs from genai-marketing in three ways that matter:
//   * headings are bare ("Module 1", "Lesson 1") with the name on a following
//     "Title of the Module:" / "Title of the Lesson:" line
//   * one document holds four courses, so capture runs from "Course 1" to "Course 2"
//   * Role Play rows leave Est. Time empty, and one Reading does too
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'cstp-course-1';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const ROLE_PLAY_DEFAULT = 10;      // matches the hands-on lab in the same lesson
const READING_DEFAULT = 5;         // the two readings that do state a time both say 5
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';

const course = { title: '', description: '', offeringType: 'Private', sme: '', modules: [] };
const intro = [];
const wrapUp = [];

let inCourse1 = false, section = null, mod = null, les = null;
let awaitTitle = null;             // 'module' | 'lesson' — the next Title-of line belongs here
const courseDesc = [];
const courseLOs = [];

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    // Stated once for the whole program, before the Course 1 heading.
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)) && !course.sme) { course.sme = m[1].trim(); continue; }

    if (/^Course\s*1\b/i.test(t) && !/^Course\s*1\d/.test(t)) { inCourse1 = true; section = null; mod = les = null; continue; }
    if (/^Course\s*[2-9]\b/i.test(t)) break;                 // Course 1 only
    if (!inCourse1) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.+)$/i))) { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^C1LO(\d+)\s*:\s*(.+)$/i)))           { courseLOs.push(m[2].trim()); continue; }
    if ((m = t.match(/^Aligned Program-level Learning Objective\s*:?\s*(.*)$/i))) {
      if (m[1].trim()) course.alignedPLO = m[1].trim();
      else course._awaitPLO = true;
      continue;
    }
    if (course._awaitPLO && /^PLO\d/i.test(t)) { course.alignedPLO = t; course._awaitPLO = false; continue; }

    if (/^Introduction to Course/i.test(t))  { section = 'intro'; mod = les = null; continue; }
    if (/^Supplementary Items/i.test(t))     { section = 'supplementary'; mod = les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      section = null;
      mod = { number: m[1], name: '', description: '', objectives: [], lessons: [] };
      course.modules.push(mod);
      les = null; awaitTitle = 'module';
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) { mod.name = m[1].trim(); continue; }

    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      section = null;
      les = { number: m[1], name: '', items: [] };
      mod.lessons.push(les);
      awaitTitle = 'lesson';
      continue;
    }
    // Lesson numbering restarts at 1 inside every module and the number stays in the name.
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && les) {
      les.name = `Lesson ${les.number}: ${m[1].trim()}`;
      continue;
    }

    // Module 3 writes the aligned objective as a bullet; Module 2 leaves the value blank and
    // puts "C1LO2 - ..." on the next line.
    if ((m = t.match(/^(?:•\s*)?Aligned Course-level Learning Objective\s*:?\s*(C1LO\d+\s*[-–]?\s*.*)?$/i)) && mod) {
      if (m[1] && m[1].trim()) mod.alignedLO = m[1].trim();
      else mod._awaitLO = true;
      continue;
    }
    if (mod && mod._awaitLO && /^C1LO\d/i.test(t)) { mod.alignedLO = t; mod._awaitLO = false; continue; }

    if ((m = t.match(/^Description\s*:\s*(.+)$/i))) {
      if (awaitTitle === 'module' && mod && !mod.description) mod.description = m[1].trim();
      awaitTitle = null;
      continue;
    }
    continue;
  }

  if (!inCourse1) continue;
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  const target = section === 'intro' ? intro : section === 'supplementary' ? wrapUp : les && les.items;
  if (!target) { warnings.push(`items table outside any lesson, skipped: ${rows[1] && rows[1][1]}`); continue; }

  for (const cells of rows.slice(1)) {
    const [label, title, format, desc, est, link] = cells.map(cellText);
    const type = itemType(label);
    if (!type) { warnings.push(`unrecognised item label "${label}" — skipped`); continue; }

    let min = minutes(est);
    if (min === null) {
      min = type === 'Ungraded Plugin' ? ROLE_PLAY_DEFAULT : READING_DEFAULT;
      warnings.push(`M${mod ? mod.number : '?'} ${label} "${(title || desc).slice(0, 42)}": `
        + `no Est. Time in source, assumed ${min} mins`);
    }
    // "5 mins each" on a DPQ row is per question, and every DPQ cell holds two.
    if (type === 'Discussion Prompt' && /each/i.test(est || '')) {
      const n = (desc.match(/DPQ\s*\d/gi) || []).length || 2;
      min *= n;
    }

    const instructional = type === 'Video' && /^video\s*\d+/i.test(label) && section === null;

    target.push({
      type,
      name: title || (type === 'Discussion Prompt' ? 'Discussion Prompt' : label),
      // DPQ cells prefix each question "DPQ 1:" / "DPQ 2:"; renumber to a plain list so the
      // imported prompt does not read as internal authoring shorthand.
      desc: type === 'Discussion Prompt'
        ? desc.split('\n').map(l => l.replace(/^DPQ\s*(\d+)\s*:\s*/i, '$1. ')).join('\n')
        : desc,
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

// --- course description ------------------------------------------------------------------
courseDesc.unshift('Course 1 of the Communication and Storytelling for Technical Professionals program.', '');
if (courseLOs.length) {
  courseDesc.push('By the end of this course, you will be able to:', ...courseLOs.map(l => '• ' + l));
}
if (course.alignedPLO) courseDesc.push('', `Aligned program learning objective: ${course.alignedPLO}`);
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
delete course.alignedPLO;
delete course._awaitPLO;

for (const m of course.modules) {
  if (m.alignedLO) {
    m.objectives = [m.alignedLO.replace(/^C1LO\d+\s*[-–]\s*/i, '')];
    m.description += `\n\nAligned course learning objective: ${m.alignedLO}`;
  } else {
    m.objectives = [];
    warnings.push(`Module ${m.number}: no aligned learning objective in source`);
  }
  delete m.alignedLO;
  delete m._awaitLO;
  if (!m.name) warnings.push(`Module ${m.number}: no "Title of the Module" line`);
  for (const l of m.lessons) if (!l.name) warnings.push(`Module ${m.number} Lesson ${l.number}: no title line`);
}

writeJson(course, warnings);

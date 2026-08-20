// Bridging the Soft Skills Gap — outline .docx -> course.json
// for the course-content importer (modules, lessons, items), not the quiz builder.
//
// Source shape: Part 2 holds "Module N: Title" and "Lesson N: Title" headings with one
// learning-items table per lesson, plus two tables outside any lesson — "Introduction to the
// Entire Course" and "Supplementary Items for the Entire Course". Coursera has nowhere to hang
// a course-level item, so both are folded into lessons. See PLACEMENT below.
//
// Two things this outline states that most do not, and which are carried through rather than
// re-derived:
//
//   Lesson objectives. Every lesson lists three higher-order objectives under "Three
//   higher-order objectives. Learners will be able to:". They are collected per lesson and
//   become the module's objectives, six to a module. Other courses fall back to the single
//   aligned course-level objective because their outlines say nothing finer.
//
//   In-video questions. Each instructional video's description ends with a literal
//   "In-video question: ...". That is read directly instead of inferring IVQs from the item
//   label, so the intro and outro videos — which carry none — are not flagged.
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'bridging-soft-skills';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];

// PLACEMENT
//   intro    -> prepended to module 1, lesson 1. The orientation table also holds the pathway
//               gate items (diagnostic guidance, the diagnostic itself, the recommended path),
//               which the outline places "before Module 1" — the closest Coursera equivalent.
//   wrap-up  -> an extra final lesson on the last module, so the outline's own four-module
//               structure survives.
const WRAPUP_LESSON = 'Course Wrap-Up and Capstone Project';

const course = {
  title: '', description: '', offeringType: 'Private', sme: '', modules: [],
};
const intro = [];
const wrapUp = [];

let section = null;            // 'intro' | 'supplementary' | null
let mod = null, les = null;
let pendingDesc = null;        // which block a following "Description:" belongs to
let inPart2 = false;
let descMode = null;           // 'prose' | 'learn' — where Part 1 body text is going
let objMode = false;           // inside a lesson's "Three higher-order objectives" list

const courseDesc = [];
const courseLOs = [];

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    if ((m = t.match(/^Course Title\s*:\s*(.+)$/i)))    { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Course Subtitle\s*:\s*(.+)$/i))) { courseDesc.unshift(m[1].trim(), ''); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) { course.sme = m[1].trim(); continue; }

    if (/^Part\s*2\b/i.test(t)) { inPart2 = true; descMode = null; continue; }
    // Closing Items and the Appendix are production notes about the outline itself, not
    // learning items — they carry no tables and must not extend the supplementary section.
    if (/^(Closing Items|Appendix\b)/i.test(t)) { section = null; mod = les = null; break; }

    if (!inPart2) {
      // Part 1 supplies the course description. The blurb runs from the "Course Description"
      // heading to "How This Course Will Help You", which restates it for a different audience.
      if (/^Course Description\s*:?$/i.test(t)) { descMode = 'prose'; continue; }
      if (/^What You Will Learn\s*:?$/i.test(t)) {
        descMode = 'learn'; courseDesc.push('', 'What you will learn:'); continue;
      }
      if (/^How This Course Will Help You\s*:?$/i.test(t)) { descMode = null; continue; }
      if (/^(Duration|Level|Audience|Prerequisites|Main Outcome|Learning Objectives|Key Takeaways|Skills Included|SEO Keywords|Category|Subcategory|What is primarily taught|Proof of Learning)\b/i.test(t)) {
        descMode = null;
        if ((m = t.match(/^(Level|Prerequisites)\s*:\s*(.+)$/i))) courseDesc.push('', m[1] + ': ' + m[2].trim());
        continue;
      }
      // "LO1: Analyze the causes ...", each followed by a "(Grounded in ...)" provenance note
      // that is deliberately not captured.
      if ((m = t.match(/^LO(\d+)\s*:\s*(.+)$/i))) { courseLOs.push(m[2].trim()); continue; }
      if (descMode === 'prose') courseDesc.push(t);
      else if (descMode === 'learn') courseDesc.push('• ' + t);
      continue;
    }

    if (/^Introduction to (the )?Entire Course/i.test(t)) {
      section = 'intro'; mod = les = null; objMode = false; continue;
    }
    if (/^Supplementary Items/i.test(t)) {
      section = 'supplementary'; mod = les = null; objMode = false; continue;
    }
    // Prose only; its items live in the orientation table above.
    if (/^Pathway Gate\b/i.test(t)) { section = null; mod = les = null; objMode = false; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*:\s*(.+)$/i))) {
      section = null; objMode = false;
      mod = { number: m[1], name: m[2].trim(), description: '', objectives: [], lessons: [] };
      course.modules.push(mod);
      les = null; pendingDesc = 'module';
      continue;
    }
    // Lesson numbering restarts at 1 inside every module, and the number is kept in the name —
    // Coursera shows the lesson name in the outline, not the number column.
    if ((m = t.match(/^Lesson\s+(\d+)\s*:\s*(.+)$/i)) && mod) {
      section = null; objMode = false;
      les = { number: m[1], name: 'Lesson ' + m[1] + ': ' + m[2].trim(), objectives: [], items: [] };
      mod.lessons.push(les);
      pendingDesc = 'lesson';
      continue;
    }
    if ((m = t.match(/^Aligned Learning Objective\s*:\s*(.+)$/i)) && mod) {
      mod.alignedLO = m[1].trim(); continue;
    }
    if (/^Source(\s+chapters)?\s*:/i.test(t)) continue;           // book provenance, not content

    if (/higher-order objectives\b/i.test(t) && les) { objMode = true; continue; }
    // The objectives list ends at the Now-Next-Later block that follows every lesson.
    if (/^Now\s*[–—-]\s*Next\s*[–—-]\s*Later\s*:?/i.test(t)) { objMode = false; continue; }
    if (objMode) {
      if (/^(Now|Next|Later)\s*:/i.test(t)) { objMode = false; continue; }
      les.objectives.push(t);
      continue;
    }

    if (/^Description\s*:?$/i.test(t)) continue;                  // label, value follows
    if ((m = t.match(/^Description\s*:\s*(.+)$/i))) {
      if (pendingDesc === 'module' && mod) mod.description = m[1].trim();
      if (pendingDesc === 'lesson' && les) les.description = m[1].trim();
      continue;
    }
    continue;
  }

  // --- learning-items table ---
  if (!inPart2) continue;
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  const target = section === 'intro' ? intro
               : section === 'supplementary' ? wrapUp
               : les && les.items;
  if (!target) {
    warnings.push('items table outside any lesson, skipped: ' + (rows[1] && rows[1][1]));
    continue;
  }

  for (const cells of rows.slice(1)) {
    const [label, title, format, desc, est, link] = cells.map(cellText);
    const type = itemType(label);
    if (!type) { warnings.push('unrecognised item label "' + label + '" — skipped'); continue; }

    let min = minutes(est);
    if (min === null) {
      min = 5;
      warnings.push(label + ' "' + (title || desc.slice(0, 40)) + '": no Est. Time in source, assumed ' + min + ' mins');
    }
    // Two pathway-gate rows leave the title blank. The label is a usable item name, but say so
    // rather than letting "Recommended Learning Path" look like an authored title.
    if (!title) warnings.push(label + ': no Learning Item Title in source, using the label as the item name');

    const where = section === 'intro' ? 'Introduction to the Entire Course'
                : section === 'supplementary' ? 'Supplementary Items'
                : 'M' + mod.number + ' L' + les.number;

    target.push({
      type,
      name: title || label,
      desc,
      min,
      ivq: type === 'Video' && /In-?video question\s*:/i.test(desc) ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: 'Outline: ' + where + ' – ' + label,
    });
  }
}

// --- fold the two course-level tables into lessons -------------------------------------
if (intro.length) {
  const first = course.modules[0] && course.modules[0].lessons[0];
  if (first) first.items.unshift(...intro);
  else warnings.push('course intro items found but module 1 has no lesson to hold them');
}
if (wrapUp.length) {
  const last = course.modules[course.modules.length - 1];
  if (last) {
    const n = last.lessons.length + 1;
    last.lessons.push({
      number: String(n), name: 'Lesson ' + n + ': ' + WRAPUP_LESSON, objectives: [], items: wrapUp,
    });
  } else warnings.push('supplementary items found but there are no modules');
}

// --- course description -----------------------------------------------------------------
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
if (!course.sme) warnings.push('no Lead Instructor in the outline — Writer/SME left blank');

// Module objectives are the lessons' own higher-order objectives, which this outline states in
// full. The aligned course-level objective is appended to the module description instead, where
// it reads as context rather than as a seventh objective.
for (const m of course.modules) {
  m.objectives = m.lessons.flatMap(l => l.objectives || []);
  if (!m.objectives.length) warnings.push('Module ' + m.number + ': no lesson objectives found in source');
  if (m.alignedLO) {
    const full = courseLOs.find(lo =>
      lo.slice(0, 25).toLowerCase() === m.alignedLO.slice(0, 25).toLowerCase());
    m.description += '\n\nAligned course learning objective: ' + (full || m.alignedLO);
  } else {
    warnings.push('Module ' + m.number + ': no aligned learning objective in source');
  }
  delete m.alignedLO;
  for (const l of m.lessons) { delete l.description; delete l.objectives; }
}

writeJson(course, warnings);

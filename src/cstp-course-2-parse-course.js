// CSTP Course 2, "Storytelling and Influence in Technical Environments" — outline .docx ->
// course.json for the course-content importer. Course 2 only; the source carries four.
//
// Same document and same shape as cstp-course-1-parse-course.js, scoped one course along:
//   * headings are bare ("Module 1", "Lesson 1") with the name on a following
//     "Title of the Module:" / "Title of the Lesson:" line
//   * capture runs from the "Course 2" heading to the next "Course <n>" heading
//   * objective ids are C2LO<n>, and all three are written in one <w:br/>-separated paragraph
//   * each module states its aligned objective with the text inline, where Course 1 sometimes
//     leaves the value blank and puts the id on the next line
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'cstp-course-2';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const ROLE_PLAY_DEFAULT = 10;      // matches the hands-on lab in the same lesson
const READING_DEFAULT = 5;         // the two readings that do state a time both say 5
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';

const course = { title: '', description: '', offeringType: 'Private', sme: '', modules: [] };
const intro = [];
const wrapUp = [];

let inCourse = false, section = null, mod = null, les = null;
let awaitTitle = null;             // 'module' | 'lesson' — the next Title-of line belongs here
const courseDesc = [];
const courseLOs = [];

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    // Stated once for the whole program, before the Course 2 heading.
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)) && !course.sme) { course.sme = m[1].trim(); continue; }

    if (/^Course\s*2\b/i.test(t) && !/^Course\s*2\d/.test(t)) { inCourse = true; section = null; mod = les = null; continue; }
    if (/^Course\s*\d+\b/i.test(t) && inCourse) break;        // the next course ends the scope
    if (!inCourse) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.+)$/i))) { course.title = m[1].trim(); continue; }
    // All three course objectives sit in ONE paragraph separated by <w:br/>, which
    // lib-outline-course now turns into newlines, so each line is matched separately.
    if (/^C2LO\d/i.test(t)) {
      let hit = false;
      for (const line of t.split('\n')) {
        const lm = line.match(/^C2LO(\d+)\s*[:\-–]\s*(.+)$/i);
        if (lm) { courseLOs.push(lm[2].trim()); hit = true; }
      }
      if (hit) continue;
    }
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
    // puts "C2LO2 - ..." on the next line.
    if ((m = t.match(/^(?:•\s*)?Aligned Course-level Learning Objective\s*:?\s*(C2LO\d+\s*[-–]?\s*.*)?$/i)) && mod) {
      if (m[1] && m[1].trim()) mod.alignedLO = m[1].trim();
      else mod._awaitLO = true;
      continue;
    }
    if (mod && mod._awaitLO && /^C2LO\d/i.test(t)) { mod.alignedLO = t; mod._awaitLO = false; continue; }

    if ((m = t.match(/^Description\s*:\s*(.+)$/i))) {
      if (awaitTitle === 'module' && mod && !mod.description) mod.description = m[1].trim();
      awaitTitle = null;
      continue;
    }
    continue;
  }

  if (!inCourse) continue;
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
      min = type === 'Roleplay' ? ROLE_PLAY_DEFAULT : READING_DEFAULT;
      warnings.push(`M${mod ? mod.number : '?'} ${label} "${(title || desc).slice(0, 42)}": `
        + `no Est. Time in source, assumed ${min} mins`);
    }
    // "5 mins each" on a DPQ row is per question, and a DPQ cell normally holds two.
    if (type === 'Discussion Prompt') {
      const n = (desc.match(/DPQ\s*\d/gi) || []).length;
      if (/each/i.test(est || '')) min *= (n || 2);
      // Module 2's DPQ cell holds an activity brief — "Learners map stakeholders … design an
      // influence strategy" — rather than the two open-ended questions the other two modules
      // carry. A Discussion Prompt's description BECOMES the prompt on Coursera, so this one
      // would import as an instruction with nothing to discuss.
      if (!n) {
        warnings.push(`M${mod ? mod.number : '?'} DPQ: no numbered questions in the cell; it reads `
          + `as an activity brief ("${desc.slice(0, 60)}…"). The description becomes the prompt on `
          + 'Coursera, so write the two questions before publishing.');
      }
    }

    const instructional = type === 'Video' && /^video\s*\d+/i.test(label) && section === null;

    // A reading's title cell carries the article title and, sometimes, its publication line
    // ("March 19, 2025", "Interview with Maxim Sytch"). An item name must be a single line, so
    // the first line is the name and anything after it joins the description, where it belongs.
    let name = title || (type === 'Discussion Prompt' ? 'Discussion Prompt' : label);
    let body = desc;
    if (type === 'Reading' && title.includes('\n')) {
      const [first, ...rest] = title.split('\n').map(s => s.trim()).filter(Boolean);
      name = first;
      const extra = rest.join(' ');
      if (extra) {
        body = body ? `${body}\n${extra}` : extra;
        warnings.push(`${label} "${first.slice(0, 40)}": the title cell carried `
          + `"${extra.slice(0, 50)}" below the title — moved into the description, since an `
          + 'item name has to be one line');
      }
    }

    target.push({
      type,
      name,
      // DPQ cells prefix each question "DPQ 1:" / "DPQ 2:" and put the question on the next
      // line after a <w:br/>. The label is folded back onto its question and renumbered to a
      // plain list, so the imported prompt does not read as internal authoring shorthand.
      desc: type === 'Discussion Prompt'
        ? body.replace(/^(DPQ\s*\d+\s*:)[ \t]*\n/gim, '$1 ')
              .split('\n').map(l => l.replace(/^DPQ\s*(\d+)\s*:\s*/i, '$1. ')).join('\n')
        : body,
      min,
      ivq: instructional ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: `Outline: ${section === 'intro' ? 'Introduction to Course 2'
            : section === 'supplementary' ? 'Supplementary Items for Course 2'
            : `C2 M${mod.number} L${les.number}`} – ${label}`,
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
courseDesc.unshift('Course 2 of the Communication and Storytelling for Technical Professionals program.', '');
if (courseLOs.length) {
  courseDesc.push('By the end of this course, you will be able to:', ...courseLOs.map(l => '• ' + l));
}
if (course.alignedPLO) courseDesc.push('', `Aligned program learning objective: ${course.alignedPLO}`);
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
delete course.alignedPLO;
delete course._awaitPLO;

for (const m of course.modules) {
  if (m.alignedLO) {
    m.objectives = [m.alignedLO.replace(/^C2LO\d+\s*[-–]\s*/i, '')];
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

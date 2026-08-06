// Full AI Toolkit for Work and Side Income — outline .docx -> course.json for the
// course-content importer.
//
// Bare "Module N" / "Lesson N" headings as in cstp-course-1, but four source quirks:
//   * DPQ rows put the questions in the Learning Item Title column and the placeholder
//     "2 open-ended questions" in the description — the opposite of every other outline
//   * every video description is prefixed with a literal "Description: " label
//   * "Aligned Learning Objective: LO4" states only the id; the text is in Part 1
//   * Lead Instructor is still the template placeholder "[Lead Instructor Name]"
//
// Part 1 also carries tool-application tables ("Field" / "Tool Name" / …). They are ignored
// because isItemHeader only accepts a table whose first cell is "Learning Items".
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'ai-toolkit';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';
const DPQ_PLACEHOLDER = /^\d+\s+open[-\s]ended questions?\.?$/i;

const course = { title: '', description: '', offeringType: 'Private', sme: '', modules: [] };
const intro = [];
const wrapUp = [];

let section = null, mod = null, les = null;
let awaitDesc = null;
let inPart2 = false;
const courseDesc = [];
const courseLOs = {};

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    if ((m = t.match(/^Course Title\s*[:;]\s*(.+)$/i)))    { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Course Subtitle\s*:\s*(.+)$/i)))    { courseDesc.unshift(m[1].trim(), ''); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) {
      const who = m[1].trim();
      // The outline still holds the template placeholder; writing it into every item's
      // Writer/SME column would look like a real name.
      if (/^\[.*\]$/.test(who)) warnings.push(`Lead Instructor is still the placeholder "${who}" — Writer/SME left blank`);
      else course.sme = who;
      continue;
    }
    if ((m = t.match(/^(?:•\s*)?(LO\d+)\s*[:\-–]\s*(.+)$/i)) && !inPart2) {
      courseLOs[m[1].toUpperCase()] = m[2].trim();
      continue;
    }
    if ((m = t.match(/^(Level|Prerequisites)\s*:\s*(.+)$/i)) && !inPart2) {
      courseDesc.push(`${m[1]}: ${m[2].trim()}`);
      continue;
    }

    if (/^PART 2\b/i.test(t)) { inPart2 = true; continue; }
    if (/^PART 3\b/i.test(t)) break;

    if (!inPart2) {
      if (/^Course Description\s*:?$/i.test(t)) { awaitDesc = 'course'; continue; }
      if (/^(Duration|Audience|Main Outcome|Key Takeaways|Skills Included|SEO Keywords|Category|Subcategory|Learning Objectives|Tool)\b/i.test(t)) {
        awaitDesc = null; continue;
      }
      if (awaitDesc === 'course') courseDesc.push(t.replace(/^•\s*/, '• '));
      continue;
    }

    if (/^Introduction to (the )?Entire Course/i.test(t)) { section = 'intro'; mod = les = null; continue; }
    if (/^Supplementary Items/i.test(t))                  { section = 'supplementary'; mod = les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      section = null;
      mod = { number: m[1], name: '', description: '', objectives: [], lessons: [] };
      course.modules.push(mod);
      les = null; awaitDesc = null;
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) { mod.name = m[1].trim(); continue; }

    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      section = null;
      les = { number: m[1], name: '', items: [] };
      mod.lessons.push(les);
      awaitDesc = null;
      continue;
    }
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && les) {
      les.name = `Lesson ${les.number}: ${m[1].trim()}`;
      continue;
    }

    // States only the id; the objective text lives in Part 1.
    if ((m = t.match(/^Aligned Learning Objective\s*:\s*(LO\d+)/i)) && mod) {
      mod.alignedLO = m[1].toUpperCase();
      continue;
    }

    if (/^Description\s*:?$/i.test(t)) { awaitDesc = les ? 'lesson' : 'module'; continue; }
    if ((m = t.match(/^Description\s*:\s*(.+)$/i))) {
      if (!les && mod && !mod.description) mod.description = m[1].trim();
      awaitDesc = null;
      continue;
    }
    if (awaitDesc === 'module' && mod && !mod.description) { mod.description = t; awaitDesc = null; continue; }
    if (awaitDesc === 'lesson') { awaitDesc = null; continue; }
    continue;
  }

  // --- learning-items table ---
  if (!inPart2) continue;
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  const target = section === 'intro' ? intro : section === 'supplementary' ? wrapUp : les && les.items;
  if (!target) { warnings.push(`items table outside any lesson, skipped: ${rows[1] && rows[1][1]}`); continue; }

  const where = section === 'intro' ? 'Introduction to Entire Course'
              : section === 'supplementary' ? 'Supplementary Items'
              : `M${mod.number} L${les.number}`;

  for (const cells of rows.slice(1)) {
    const [label, titleCol, format, descCol, est, link] = cells.map(cellText);
    const type = itemType(label);
    if (!type) { warnings.push(`unrecognised item label "${label}" — skipped`); continue; }

    let name = titleCol;
    // Every video description is written "Description: Walk through <title>." — the label is
    // redundant inside a cell that is already the description column.
    let desc = descCol.replace(/^Description\s*:\s*/i, '');
    let min = minutes(est);

    if (type === 'Discussion Prompt') {
      // Questions sit in the title column here; the description column holds only a count.
      const count = +((descCol.match(/^(\d+)/) || [])[1]) || 2;
      if (titleCol && /\?/.test(titleCol)) {
        name = 'Discussion Prompt';
        desc = titleCol.replace(/\s+(?=\d+\.\s)/g, '\n');       // one question per line
      } else if (DPQ_PLACEHOLDER.test(descCol)) {
        warnings.push(`${where} DPQ: no questions in source, only "${descCol}"`);
      }
      if (min !== null && /each/i.test(est || '')) min *= count;
    }

    if (min === null) {
      min = 5;
      warnings.push(`${where} ${label}: no Est. Time in source, assumed ${min} mins`);
    }
    if (!name) {
      name = /^promo/i.test(label) ? 'Promo Video' : label;
      warnings.push(`${where} ${label}: no Learning Item Title in source`);
    }

    const instructional = type === 'Video' && /^video\s*\d+/i.test(label) && section === null;

    target.push({
      type,
      name,
      desc,
      min,
      ivq: instructional ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: `Outline: ${where} – ${label}`,
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
const los = Object.keys(courseLOs).sort((a, b) => +a.slice(2) - +b.slice(2)).map(k => courseLOs[k]);
if (los.length) {
  courseDesc.push('', 'By the end of this course, you will be able to:', ...los.map(l => '• ' + l));
}
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();

for (const m of course.modules) {
  const text = m.alignedLO ? courseLOs[m.alignedLO] : null;
  if (text) {
    m.objectives = [text];
    m.description += `\n\nAligned course learning objective: ${m.alignedLO} — ${text}`;
  } else {
    m.objectives = [];
    warnings.push(`Module ${m.number}: aligned objective ${m.alignedLO || '(none)'} has no text in Part 1`);
  }
  // Module descriptions are generated boilerplate that still names the authoring source.
  if (/source curriculum/i.test(m.description)) {
    warnings.push(`Module ${m.number}: description is authoring boilerplate ("…from the source `
      + `curriculum") — rewrite before publishing`);
  }
  delete m.alignedLO;
  if (!m.name) warnings.push(`Module ${m.number}: no "Title of the Module" line`);
  for (const l of m.lessons) if (!l.name) warnings.push(`Module ${m.number} Lesson ${l.number}: no title line`);
}

writeJson(course, warnings);

// Google Ads for Performance Marketers — outline .docx -> course.json for the
// course-content importer.
//
// The same source shape as ai-toolkit: bare "Module N" / "Lesson N" headings with the name on
// a following "Title of the Module:" line, video descriptions prefixed with a literal
// "Description: " label, "Aligned Learning Objective: LO4" stating only the id, and a Lead
// Instructor still set to the template placeholder. Its own quirks on top of that:
//
//   * Reading rows are labelled "Reading (1)" and priced "5 mins each" — the count is in the
//     label, so "each" multiplies by the count in the label rather than by a description count
//   * the Course-end Project row has no title, no description and no video format; only its
//     duration and a purpose note in the link column are filled in
//   * the Promo video row has a format but no title
//   * durations are written "<=4 mins" and "<=2 mins" on the two course-level videos
//
// Part 1 also carries a tool-application table ("Field" / "Tool Name" / …). It is ignored
// because isItemHeader only accepts a table whose first cell is "Learning Items".
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'google-ads';
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

    if (/^PART\s*2\b/i.test(t)) { inPart2 = true; continue; }
    if (/^PART\s*3\b/i.test(t)) break;

    if (!inPart2) {
      if (/^Course Description\s*:?$/i.test(t)) { awaitDesc = 'course'; continue; }
      if (/^(Duration|Audience|Main Outcome|Key Takeaways|Skills Included|SEO Keywords|Category|Subcategory|Learning Objectives|Proof of Learning|Instructor Bio|Tool)\b/i.test(t)) {
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
    if ((m = t.match(/^Aligned Learning Objectives?\s*:\s*(LO\d+)/i)) && mod) {
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
    if (!type) { warnings.push(`${where}: unrecognised item label "${label}" — skipped`); continue; }

    let name = titleCol;
    // Every video description is written "Description: Walks through <title>." — the label is
    // redundant inside a cell that is already the description column.
    let desc = descCol.replace(/^Description\s*:\s*/i, '');
    let min = minutes(est);

    // "Reading (1)" priced at "5 mins each": the count is in the label, not the description.
    if (type === 'Reading' && min !== null && /each/i.test(est || '')) {
      const count = +((label.match(/\((\d+)\)/) || [])[1]) || 1;
      min *= count;
    }

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

    // The Course-end Project row states only a duration and a purpose note in the link column.
    // The note is the only description the source offers, so it is used rather than discarded.
    if (!desc && link && !/^https?:\/\//i.test(link)) {
      desc = link;
      warnings.push(`${where} ${label}: no description in source, used the link column's note "${link}"`);
    }

    if (min === null) {
      min = 5;
      warnings.push(`${where} ${label}: no Est. Time in source, assumed ${min} mins`);
    }
    if (!name) {
      name = /^promo/i.test(label) ? 'Promo Video' : label;
      warnings.push(`${where} ${label}: no Learning Item Title in source, named "${name}"`);
    }
    if (!desc) warnings.push(`${where} ${label} "${name}": no description in source`);

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
  delete m.alignedLO;
  if (!m.name) warnings.push(`Module ${m.number}: no "Title of the Module" line`);
  if (!m.description) warnings.push(`Module ${m.number}: no description`);
  for (const l of m.lessons) if (!l.name) warnings.push(`Module ${m.number} Lesson ${l.number}: no title line`);
}

writeJson(course, warnings);

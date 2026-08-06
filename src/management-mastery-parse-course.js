// Management Mastery: Motivating Others — outline .docx -> course.json for the
// course-content importer.
//
// Heading grammar matches cstp-course-1: bare "Module N" / "Lesson N" with the name on a
// following "Title of the Module:" line. Differences that needed handling:
//   * "Course Title;" — semicolon, not colon
//   * aligned objectives state their own text inline ("LO1: Apply goal-setting frameworks…")
//     and alternate between "LO1:" and "LO2 -" separators
//   * two Readings in each module's third lesson, not one
//   * DPQ rows carry no title and no questions, only the placeholder "2 open-ended questions"
//   * the Module 3 Role Play and the Promo video have no title
//   * superseded role-play wording is struck through inline (dropped by lib-outline-course)
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'management-mastery';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const ROLE_PLAY_DEFAULT = 10;
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';
const DPQ_PLACEHOLDER = /^\d+\s+open[-\s]ended questions?\.?$/i;

const course = { title: '', description: '', offeringType: 'Private', sme: '', modules: [] };
const intro = [];
const wrapUp = [];

let section = null, mod = null, les = null;
let awaitDesc = null;                    // 'module' | 'lesson' — "Description:" with no value
let inPart2 = false;
const courseDesc = [];
const courseLOs = {};

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    // Source writes "Course Title;" — accept either separator.
    if ((m = t.match(/^Course Title\s*[:;]\s*(.+)$/i)))   { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)))   { course.sme = m[1].trim(); continue; }
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
      if (/^(Duration|Audience|Main Outcome|Key Takeaways|Skills Included|SEO Keywords|Category|Subcategory|Learning Objectives)\b/i.test(t)) {
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
    // Lesson numbering restarts at 1 in every module and the number stays in the name.
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && les) {
      les.name = `Lesson ${les.number}: ${m[1].trim()}`;
      continue;
    }

    // "Aligned Learning Objective: LO1: Apply goal-setting frameworks…" — the objective text
    // is stated here in full, unlike sources that only cross-reference an LO id.
    if ((m = t.match(/^Aligned Learning Objective\s*:\s*(LO\d+)?\s*[:\-–]?\s*(.*)$/i)) && mod) {
      const id = (m[1] || '').toUpperCase();
      const text = m[2].trim();
      mod.alignedLO = { id, text: text || courseLOs[id] || '' };
      continue;
    }

    // Module 3 Lesson 1 puts "Description:" on its own line with the prose beneath it.
    if (/^Description\s*:?$/i.test(t)) { awaitDesc = les ? 'lesson' : 'module'; continue; }
    if ((m = t.match(/^Description\s*:\s*(.+)$/i))) {
      if (les) { /* lesson descriptions are not imported */ }
      else if (mod && !mod.description) mod.description = m[1].trim();
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
    const [label, title, format, desc, est, link] = cells.map(cellText);
    const type = itemType(label);
    if (!type) { warnings.push(`unrecognised item label "${label}" — skipped`); continue; }

    let min = minutes(est);
    if (min === null) {
      min = type === 'Roleplay' ? ROLE_PLAY_DEFAULT : 5;
      warnings.push(`${where} ${label}: no Est. Time in source, assumed ${min} mins`);
    }
    // "5 mins each" against a two-question DPQ is per question.
    if (type === 'Discussion Prompt' && /each/i.test(est || '')) {
      const n = +((desc || '').match(/^(\d+)/) || [])[1] || 2;
      min *= n;
    }

    if (type === 'Discussion Prompt' && DPQ_PLACEHOLDER.test(desc || '')) {
      warnings.push(`${where} DPQ: source states only "${desc}" — the questions are not written, `
        + `so the imported prompt is a placeholder`);
    }
    if (!title) warnings.push(`${where} ${label}: no Learning Item Title in source`);
    if (!desc && type === 'Video') warnings.push(`${where} ${label} "${title}": no description in source`);

    const instructional = type === 'Video' && /^video\s*\d+/i.test(label) && section === null;

    target.push({
      type,
      name: title || (type === 'Discussion Prompt' ? 'Discussion Prompt'
                    : /^promo/i.test(label) ? 'Promo Video'
                    : /^role\s*play/i.test(label) ? 'Role Play' : label),
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
const los = Object.keys(courseLOs).sort().map(k => courseLOs[k]);
if (los.length) {
  courseDesc.push('', 'By the end of this course, you will be able to:', ...los.map(l => '• ' + l));
}
course.description = courseDesc.map(clean).filter((l, i, a) => l || (a[i - 1] || '')).join('\n')
  .replace(/\n{3,}/g, '\n\n').trim();

for (const m of course.modules) {
  if (m.alignedLO && m.alignedLO.text) {
    m.objectives = [m.alignedLO.text];
    m.description += `\n\nAligned course learning objective: ${m.alignedLO.id}`
      + `${m.alignedLO.id ? ' — ' : ''}${m.alignedLO.text}`;
  } else {
    m.objectives = [];
    warnings.push(`Module ${m.number}: no aligned learning objective in source`);
  }
  delete m.alignedLO;
  if (!m.name) warnings.push(`Module ${m.number}: no "Title of the Module" line`);
  for (const l of m.lessons) if (!l.name) warnings.push(`Module ${m.number} Lesson ${l.number}: no title line`);
}

writeJson(course, warnings);

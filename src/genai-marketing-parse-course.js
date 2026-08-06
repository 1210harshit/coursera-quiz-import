// GenAI for Marketing & Customer Engagement — outline .docx -> course.json
// for the course-content importer (modules, lessons, items), not the quiz builder.
//
// Source shape: PART 2 holds "Module N: Title" headings, "Lesson N: Title" headings and one
// learning-items table per lesson. Two tables sit outside any lesson — "Introduction to
// Entire Course" and "Supplementary Items for Entire Course" — and Coursera has nowhere to
// put a course-level item, so both are folded into lessons. See PLACEMENT below.
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'genai-marketing';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const ROLE_PLAY_DEFAULT = 12;   // outline gives ranges; midpoint is applied by minutes()

// PLACEMENT
//   intro    -> prepended to the first lesson of module 1
//   wrap-up  -> an extra final lesson on the last module, so the 4-module structure and the
//               outline's "modules are independent" rationale both survive
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';

const course = {
  title: '', description: '', offeringType: 'Private', sme: '', modules: [],
};
const intro = [];
const wrapUp = [];

let section = null;            // 'intro' | 'supplementary' | null
let mod = null, les = null;
let pendingDesc = null;        // "Description:" on its own line, value on the next
let inPart2 = false;

const courseDesc = [];
const courseLOs = [];

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    if ((m = t.match(/^Course Title\s*:\s*(.+)$/i)))      { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Course Subtitle\s*:\s*(.+)$/i)))   { courseDesc.unshift(m[1].trim(), ''); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)))   { course.sme = m[1].trim(); continue; }
    if ((m = t.match(/^(?:•\s*)?LO\d+\s*:\s*(.+)$/i)))    { courseLOs.push(m[1].trim()); continue; }
    if ((m = t.match(/^(Level|Prerequisites)\s*:\s*(.+)$/i))) {
      courseDesc.push(`${m[1]}: ${m[2].trim()}`); continue;
    }

    if (/^PART 2\b/i.test(t)) { inPart2 = true; continue; }
    if (/^PART 3\b/i.test(t)) break;

    if (!inPart2) {
      // Everything between the description label and "Duration:" is the marketing blurb.
      if (/^Course Description\s*:?$/i.test(t)) { pendingDesc = 'course'; continue; }
      if (/^(Duration|Audience|Main Outcome|Key Takeaways|Skills Included|SEO Keywords|Category|Subcategory|Proof of Learning)\b/i.test(t)) {
        pendingDesc = null; continue;
      }
      if (pendingDesc === 'course' && !/^Learning Objectives/i.test(t)) courseDesc.push(t);
      continue;
    }

    if (/^Introduction to (the )?Entire Course/i.test(t)) { section = 'intro'; mod = les = null; continue; }
    if (/^Supplementary Items/i.test(t))                  { section = 'supplementary'; mod = les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*:\s*(.+)$/i))) {
      section = null;
      mod = { number: m[1], name: m[2].trim(), description: '', objectives: [], lessons: [] };
      course.modules.push(mod);
      les = null; pendingDesc = 'module';
      continue;
    }
    // Lesson numbering restarts at 1 inside every module, and the number is kept in the
    // name — Coursera shows the lesson name in the outline, not the number column.
    if ((m = t.match(/^(?:•\s*)?Lesson\s+(\d+)\s*:\s*(.+)$/i)) && mod) {
      section = null;
      les = { number: m[1], name: `Lesson ${m[1]}: ${m[2].trim()}`, items: [] };
      mod.lessons.push(les);
      pendingDesc = 'lesson';
      continue;
    }
    if ((m = t.match(/^Aligned Learning Objective\s*:\s*(.+)$/i)) && mod) {
      mod.alignedLO = m[1].trim();
      continue;
    }
    if (/^Description\s*:?$/i.test(t)) continue;                 // label, value follows
    if ((m = t.match(/^Description\s*:\s*(.+)$/i))) {
      if (pendingDesc === 'module' && mod) mod.description = m[1].trim();
      pendingDesc = null;
      continue;
    }
    if (pendingDesc === 'module' && mod && !mod.description) { mod.description = t; continue; }
    if (pendingDesc === 'lesson' && les && !les.description)  { les.description = t; continue; }
    continue;
  }

  // --- learning-items table ---
  if (!inPart2) continue;
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
      min = type === 'Ungraded Plugin' ? ROLE_PLAY_DEFAULT : 5;
      warnings.push(`${label} "${title || desc.slice(0, 40)}": no Est. Time in source, assumed ${min} mins`);
    }

    // Intro and wrap-up videos carry no in-video question; the outline's IVQ count is one
    // per instructional video, and those are exactly the numbered ones.
    const instructional = type === 'Video' && /^video\s*\d+/i.test(label) && section === null;

    target.push({
      type,
      name: title || label,
      desc,
      min,
      ivq: instructional ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: `Outline: ${section === 'intro' ? 'Introduction to Entire Course'
            : section === 'supplementary' ? 'Supplementary Items'
            : `M${mod.number} L${les.number}`} – ${label}`,
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
    last.lessons.push({ number: String(n), name: `Lesson ${n}: ${WRAPUP_LESSON}`, items: wrapUp });
  } else warnings.push('supplementary items found but there are no modules');
}

// --- course description -----------------------------------------------------------------
if (courseLOs.length) {
  courseDesc.push('', 'By the end of this course, you will be able to:', ...courseLOs.map(l => '• ' + l));
}
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Module objectives come from the outline's aligned course-level objective. Outlines rarely
// state per-lesson objectives, so this is deliberately thin — author richer ones by editing
// course.json before the build step.
for (const m of course.modules) {
  if (m.alignedLO) {
    const text = courseLOs.find(l => l.toLowerCase().startsWith(m.alignedLO.toLowerCase().slice(0, 4)));
    m.objectives = [text || m.alignedLO];
    m.description += `\n\nAligned course learning objective: ${m.alignedLO}${text ? ' — ' + text : ''}`;
  } else {
    m.objectives = [];
    warnings.push(`Module ${m.number}: no aligned learning objective in source`);
  }
  delete m.alignedLO;
  for (const l of m.lessons) delete l.description;
}

writeJson(course, warnings);

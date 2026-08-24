// Rapport Mastery (Course 1) — outline .docx -> course.json
// for the course-content importer. Scoped to COURSE 1 of a five-course program.
//
// Source shape: bare "Module 1" / "Lesson 1" headings with the name on a following
// "Title of the Module:" / "Title of the Lesson:" line, as cstp-course-1. One document holds
// five courses, so capture runs from "Course 1" to "Course 2".
//
// Inconsistencies this absorbs, all of them ordinary drafting drift:
//   * Module 1 labels its blurb "Description:", modules 2 and 3 use "Module Description:".
//   * Some lessons label their blurb "Description:" and some write it as bare prose under the
//     title line.
//   * Every Role Play Activity row leaves Est. Time empty. Each takes a default and warns.
//
// The outline states no per-lesson objectives, only one aligned course-level objective per
// module, and it writes both the id and the full text inline ("C1LO1 — Analyze the ..."). So
// module objectives are that single sentence. Author richer ones by editing course.json before
// building; that is what the intermediate file is for.
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'sales-comms-course-1';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];

// PLACEMENT — matching bridging-soft-skills.
//   intro    -> its own module, first. The outline gives it a section of its own
//               ("Introduction to Course 1"), and the welcome video does not belong inside
//               "Lesson 1: How Buyer Psychology Has Changed". Content modules shift to 2-4.
//   wrap-up  -> an extra final lesson on the last content module. It carries the course wrap-up
//               video, the single graded quiz and the course-end project.
const INTRO_MODULE = 'Introduction to the Course';
const INTRO_LESSON = 'Course Introduction';
const WRAPUP_LESSON = 'Course Wrap-Up and Assessment';
const ROLE_PLAY_DEFAULT = 20;   // every Role Play Activity row leaves Est. Time empty

const course = {
  title: '', description: '', offeringType: 'Private', sme: '', modules: [],
};
const intro = [];
const wrapUp = [];

let inCourse1 = false;
let section = null;            // 'intro' | 'supplementary' | null
let mod = null, les = null;
let descTarget = null;         // 'course' | 'module' | 'lesson' — who owns following prose

const courseDesc = [];
const courseLOs = {};          // C1LO1 -> text

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    // Stated once for the program, before the Course 1 heading.
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)) && !course.sme) course.sme = m[1].trim();

    if (/^Course\s*1\b/i.test(t) && !inCourse1) { inCourse1 = true; mod = les = null; continue; }
    if (/^Course\s*[2-9]\b/i.test(t) && inCourse1) break;          // Course 1 only
    if (!inCourse1) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.+)$/i))) {
      course.title = m[1].trim(); descTarget = null; continue;
    }
    if ((m = t.match(/^(C1LO\d+)\s*:\s*(.+)$/i))) {
      courseLOs[m[1]] = m[2].trim(); descTarget = null; continue;
    }
    // "Aligned Course-level Learning Objective: C1LO1 — Analyze the cognitive and ..." states
    // the id and the sentence together, so nothing has to be resolved against Part 1.
    if ((m = t.match(/^Aligned Course-level Learning Objective\s*:\s*(?:(C1LO\d+)\s*[—–-]\s*)?(.+)$/i)) && mod) {
      mod.alignedLO = { id: m[1] || '', text: m[2].trim() };
      descTarget = null; continue;
    }
    if (/^Aligned Program-level Learning Objective\s*:/i.test(t)) { descTarget = null; continue; }
    if (/^Learning Objectives\s*:/i.test(t))                      { descTarget = null; continue; }
    if (/^Instructor Bio\s*:/i.test(t))                           { descTarget = null; continue; }

    if (/^Introduction to Course/i.test(t)) { section = 'intro'; mod = les = null; descTarget = null; continue; }
    if (/^Supplementary Items/i.test(t))    { section = 'supplementary'; mod = les = null; descTarget = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      section = null;
      mod = { number: m[1], name: '', description: '', objectives: [], lessons: [] };
      course.modules.push(mod);
      les = null; descTarget = null;
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) {
      mod.name = m[1].trim(); descTarget = 'module'; continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      section = null;
      // Lesson numbering restarts at 1 in every module and the number is kept in the name —
      // Coursera shows the lesson name in the outline, not the number column.
      les = { number: m[1], name: '', items: [] };
      mod.lessons.push(les);
      descTarget = null;
      continue;
    }
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && les) {
      les.name = 'Lesson ' + les.number + ': ' + m[1].trim();
      descTarget = 'lesson'; continue;
    }

    // "Description:" and "Module Description:" label the same thing.
    if ((m = t.match(/^(?:Module\s+|Lesson\s+)?Description\s*:\s*(.*)$/i))) {
      const rest = m[1].trim();
      if (mod && !les && descTarget !== 'course') descTarget = 'module';
      else if (les) descTarget = 'lesson';
      else descTarget = 'course';
      if (rest) {
        if (descTarget === 'course') courseDesc.push(rest);
        else if (descTarget === 'lesson' && les) les.description = rest;
        else if (mod) mod.description = rest;
      }
      continue;
    }

    // Continuation prose. A lesson blurb sometimes has no label at all.
    if (descTarget === 'course') { courseDesc.push(t); continue; }
    if (descTarget === 'module' && mod) {
      mod.description = mod.description ? mod.description + '\n\n' + t : t; continue;
    }
    if (descTarget === 'lesson' && les) {
      les.description = les.description ? les.description + '\n\n' + t : t; continue;
    }
    continue;
  }

  // --- learning-items table ---
  if (!inCourse1) continue;
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;
  descTarget = null;

  const target = section === 'intro' ? intro
               : section === 'supplementary' ? wrapUp
               : les && les.items;
  if (!target) {
    warnings.push('items table outside any lesson, skipped: ' + (rows[1] && rows[1][1]));
    continue;
  }

  for (const cells of rows.slice(1)) {
    const [label, title, format, desc, est, link] = cells.map(cellText);
    if (!label && !title && !desc) continue;                     // spacer row
    const type = itemType(label);
    if (!type) { warnings.push('unrecognised item label "' + label + '" — skipped'); continue; }

    let min = minutes(est);
    if (min === null) {
      min = /^role\s*play/i.test(label) ? ROLE_PLAY_DEFAULT : 5;
      warnings.push(label + ' "' + (title || desc.slice(0, 40)) + '": no Est. Time in source, assumed ' + min + ' mins');
    }
    // Every DPQ row leaves the title blank and puts the prompt in the description. "DPQ 1" is
    // internal jargon and would be the learner-facing item name, so an untitled discussion
    // prompt is named for what it is. Any other untitled row falls back to its label.
    let name = title;
    if (!name) {
      const dn = label.match(/^DPQ\s*(\d+)/i);
      name = dn ? 'Discussion Prompt ' + dn[1] : label;
      warnings.push(label + ': no Learning Item Title in source, named "' + name + '"');
    }

    const where = section === 'intro' ? 'Introduction to Course 1'
                : section === 'supplementary' ? 'Supplementary Items'
                : 'M' + mod.number + ' L' + les.number;

    target.push({
      type,
      name,
      desc,
      min,
      // Every module opens with an unnumbered "Intro Video"; the numbered lesson videos are the
      // instructional ones, and those are the rows the outline pairs with an IVQ.
      ivq: type === 'Video' && /^Video\s+\d+$/i.test(label) && section === null ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: 'Outline: ' + where + ' – ' + label,
    });
  }
}

// --- the supplementary table becomes a final lesson on the last content module ------------
if (wrapUp.length) {
  const last = course.modules[course.modules.length - 1];
  if (last) {
    const n = last.lessons.length + 1;
    last.lessons.push({ number: String(n), name: 'Lesson ' + n + ': ' + WRAPUP_LESSON, items: wrapUp });
  } else warnings.push('supplementary items found but there are no modules');
}

// --- course description -------------------------------------------------------------------
course.description = courseDesc.map(clean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
if (!course.sme) warnings.push('no Lead Instructor in the outline — Writer/SME left blank');

for (const m of course.modules) {
  if (!m.name) warnings.push('Module ' + m.number + ': no "Title of the Module:" line');
  if (m.alignedLO) {
    m.objectives = [m.alignedLO.text];
    m.description += '\n\nAligned course learning objective'
      + (m.alignedLO.id ? ' (' + m.alignedLO.id + ')' : '') + ': ' + m.alignedLO.text;
  } else {
    m.objectives = [];
    warnings.push('Module ' + m.number + ': no aligned learning objective in source');
  }
  delete m.alignedLO;
  for (const l of m.lessons) {
    if (!l.name) { l.name = 'Lesson ' + l.number; warnings.push('Module ' + m.number + ': lesson ' + l.number + ' has no title'); }
    delete l.description;
  }
}

// --- the introduction table becomes the first module ---------------------------------------
if (intro.length) {
  course.modules.unshift({
    number: '1',
    name: INTRO_MODULE,
    description: 'Orientation for ' + (course.title || 'this course') + '. '
      + 'Start here for a short welcome that frames what the course covers and how it is built.',
    objectives: [],
    lessons: [{ number: '1', name: 'Lesson 1: ' + INTRO_LESSON, items: intro }],
  });
  warnings.push('intro items promoted to their own module; content modules are now 2-'
    + course.modules.length + ', so a quiz reference of the form M<n>L<y>V<z> means module n+1');
  warnings.push('intro module: the outline states no objectives or description for it — a short '
    + 'description is generated and the objectives block is left empty; edit course.json to change either');
}
// Coursera orders modules by position, so inserting at the front renumbers everything after it.
course.modules.forEach((m, i) => { m.number = String(i + 1); });

writeJson(course, warnings);

// AI-Powered Products for Product Managers — outline .docx -> course.json for the
// course-content importer.
//
// Same heading grammar as genai-pm, ai-toolkit and paid-social: bare "Module N" / "Lesson N"
// headings with the name on a following "Title of the Module:" line, and "Aligned Learning
// Objective: LO1" stating only the id. What differs is the learning-items table, and it
// differs enough that isItemHeader() and itemType() from lib-outline-course cannot be used as
// they stand:
//
//   | Learning Item Title      | Video Format | High level Description | Est. Time | Link |
//
// There is no "Learning Items" column. Every other source names each row's kind there
// ("Video 1", "Reading", "DPQ"), and itemType() reads that label. Here the kind has to come
// from two other places, in this order:
//
//   1. the TITLE, where the row is a course-level or activity item — "Graded Quiz",
//      "Course-end Project", "DPQ", "Hands-on Lab: …", "Role Play Activity → …". itemType()
//      already recognises all of those, so it is tried first and unchanged.
//   2. the VIDEO FORMAT column, which in this template doubles as the kind column: a video
//      row names a production format (Talking Head, Conceptual, Demo) and everything else
//      names its Coursera kind (Reading, Discussion, Activity/Exercise, Interactive).
//
// A title is only ever consulted through itemType()'s existing patterns — no new vocabulary is
// invented for it — so a row this parser cannot place is reported rather than guessed at.
//
// Three shapes in this particular document need their own handling, each marked below:
//
//   * the lesson-3 tables carry a SECOND header row partway down. Everything after it is a
//     module-level item — the readings, the DPQ, the hands-on lab and the role play. They are
//     kept in lesson 3, which is where the source puts them, and their `ref` names the module
//     so a reviewer can see they are not lesson-3 content.
//   * "Course-end Project" states its real name in the Video Format column ("Capstone
//     Project: Create an AI Product Brief …"). The row is malformed rather than ambiguous —
//     the columns are shifted by one — so the capstone title is taken as the name.
//   * two rows prefix the name with their own kind and an arrow ("Hands-on-lab → Hands-on
//     Lab: Build an AI Launch-Readiness Scorecard"). The prefix is a label, not part of the
//     name, so it is removed once the row has been typed.
const path = require('path');
const {
  readBlocks, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'ai-products';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';

// Coursera drops any item whose name is under five characters, so a name that short has to be
// lengthened before the build. Keyed by "M<module>L<lesson>V<video>". Empty here: the shortest
// name this outline produces is well clear of the limit.
const NAME_FIXUPS = {};

// The header of a learning-items table in this template. Also used to spot the SECOND header
// inside the lesson-3 tables, which is what separates a lesson's videos from the module's own
// items — see the note at the top.
const isItemHeader = cells =>
  /^Learning Item Title$/i.test(clean(cells[0] || '')) && /^Video Format$/i.test(clean(cells[1] || ''));

// The Video Format column as a kind. Only these produce a Video; everything else names a
// Coursera item kind directly and is looked up in FORMAT_TYPES.
const VIDEO_FORMAT = f =>
  /^(talking\s*head|conceptual|demo|screenshare|screen\s*capture|slides?|interview|animation)\b/i
    .test(clean(f || ''));
const FORMAT_TYPES = [
  [/^reading\b/i, 'Reading'],
  [/^discussion\b/i, 'Discussion Prompt'],
  [/^(activity|exercise|activity\s*\/\s*exercise|hands)\b/i, 'Peer Review'],
  [/^(interactive|role\s*play)\b/i, 'Roleplay'],
  [/^graded\s*assessment\b/i, 'Assignment'],
  [/^capstone\b/i, 'Peer Review'],
];

const isModuleIntro = t => /^module\s+introduction$/i.test(clean(t || ''));

// "Hands-on-lab → Hands-on Lab: Build …" — the part before the arrow is the row's own kind
// label, which the title column of this template is not supposed to carry.
const stripKindPrefix = name => name.replace(/^[^→]{0,40}→\s*/, '').trim();

// A DPQ row that states only how many questions there will be, rather than the questions.
const DPQ_PLACEHOLDER = /^\d+\s+open[-\s]ended questions?\b/i;

const MIN_ITEM_NAME = 5;                      // must match course-import-build.js

const course = { title: '', description: '', offeringType: 'Private', sme: '', modules: [] };
const intro = [];
const wrapUp = [];

let section = null, mod = null, les = null;
let awaitDesc = null;
let inPart2 = false;
const courseDesc = [];
const courseLOs = {};
const claimed = { ivq: null, lab: null, dpq: null };   // Part 1's "Proof of Learning" numbers

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    if ((m = t.match(/^Course Title\s*[:;]\s*(.+)$/i)))      { course.title = m[1].trim(); continue; }
    // This outline writes "Course Subtitle - …" where most others use a colon.
    if ((m = t.match(/^Course Subtitle\s*[-–—:]\s*(.+)$/i))) { courseDesc.unshift(m[1].trim(), ''); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) {
      const who = m[1].trim();
      // Writing a template placeholder into every item's Writer/SME column would look like a
      // real name, so it is refused rather than passed through.
      if (/^\[.*\]$/.test(who)) warnings.push(`Lead Instructor is still the placeholder "${who}" — Writer/SME left blank`);
      else course.sme = who;
      continue;
    }
    if ((m = t.match(/^(?:•\s*)?(LO\d+)\s*(?:\([^)]*\))?\s*[:\-–]\s*(.+)$/i)) && !inPart2) {
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
      // "Proof of Learning" states how many IVQs, labs and DPQs the course is supposed to
      // have. Those numbers are written by hand and drift from the tables below, so they are
      // captured and checked rather than trusted.
      if ((m = t.match(/^(?:•\s*)?In-Video Questions \(IVQs\)\s*:\s*(\d+)/i)))          { claimed.ivq = +m[1]; continue; }
      if ((m = t.match(/^(?:•\s*)?Hands[-\s]?on[-\s]?lab Activities\s*:\s*(\d+)/i)))    { claimed.lab = +m[1]; continue; }
      if ((m = t.match(/^(?:•\s*)?Discussion Prompt Questions \(DPQs\)\s*:\s*(\d+)/i))) { claimed.dpq = +m[1]; continue; }

      if (/^Course Description\s*:?$/i.test(t)) { awaitDesc = 'course'; continue; }
      if (/^(Duration|Audience|Main Outcome|Key Takeaways|Skills Included|SEO Keywords|Category|Subcategory|Learning Objectives|Proof of Learning|Instructor Bio|Tool|What is primarily taught)\b/i.test(t)) {
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
    if ((m = t.match(/^Aligned Learning Objectives?\s*:\s*(LO\d+(?:\s*[,;&]\s*(?:and\s+)?LO\d+)*)/i)) && mod) {
      mod.alignedLOs = m[1].match(/LO\d+/gi).map(s => s.toUpperCase());
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

  const lessonWhere = section === 'intro' ? 'Introduction to Entire Course'
                    : section === 'supplementary' ? 'Supplementary Items'
                    : `M${mod.number} L${les.number}`;
  // Set once the second header row is passed: what follows belongs to the module, not the
  // lesson whose table it happens to sit in.
  let moduleLevel = false;

  for (const [rowIndex, cells] of rows.entries()) {
    if (isItemHeader(cells)) {
      if (rowIndex > 0 && section === null) moduleLevel = true;
      continue;
    }
    const where = moduleLevel ? `M${mod.number} (module items)` : lessonWhere;

    let [titleCol, format, descCol, est, link] = cells.map(cellText);

    // A title cell wrapped across two lines in the source. Everything downstream — the item
    // name, the .xlsx cell — is a single line, so the wrap is folded rather than treated as
    // two titles the way genai-pm's two-article reading rows are.
    if (/\n/.test(titleCol)) {
      warnings.push(`${where}: item title "${titleCol.replace(/\n+/g, ' ⏎ ')}" is wrapped across `
        + 'lines in the source — folded to one line');
      titleCol = titleCol.replace(/\s*\n\s*/g, ' ').trim();
    }

    // The kind comes from the title where itemType() recognises it, and otherwise from the
    // Video Format column. See the note at the top for why, in that order.
    let type = itemType(titleCol);
    let typedFrom = 'title';
    if (!type) {
      typedFrom = 'format';
      if (VIDEO_FORMAT(format)) type = 'Video';
      else {
        const hit = FORMAT_TYPES.find(([re]) => re.test(clean(format)));
        type = hit ? hit[1] : null;
      }
    }
    if (!type) {
      warnings.push(`${where}: cannot type the row "${titleCol.slice(0, 50)}" — its title is not a `
        + `known item label and its Video Format "${format}" is not a known format. Skipped.`);
      continue;
    }

    let name = stripKindPrefix(titleCol);
    if (name !== titleCol) {
      warnings.push(`${where}: item title carried its own kind label — "${titleCol.slice(0, 60)}" `
        + `read as "${name}"`);
    }
    let desc = descCol.replace(/^Description\s*:\s*/i, '');
    let min = minutes(est);

    // The Course-end Project row is written one column to the left of where it belongs: the
    // title column holds the kind ("Course-end Project") and the Video Format column holds the
    // actual name ("Capstone Project: Create an AI Product Brief …"). Recognisable because the
    // format column is not a format, so nothing else can match this shape.
    if (/^course[-\s]?end\s*project$/i.test(name) && format && !VIDEO_FORMAT(format)
        && !FORMAT_TYPES.some(([re]) => re.test(clean(format)))) {
      warnings.push(`${where}: the Course-end Project row is shifted one column — its name is in the `
        + `Video Format cell. Used "${format}" as the item name.`);
      name = format;
    }

    if (type === 'Discussion Prompt') {
      // The description column states only how many questions there will be; the questions
      // themselves are not in this outline. That is an authoring gap, not a parse failure —
      // the item is still created so the module structure is right.
      const count = +((descCol.match(/^(\d+)/) || [])[1]) || 2;
      name = 'Discussion Prompt';
      if (DPQ_PLACEHOLDER.test(descCol)) {
        warnings.push(`${where} DPQ: the outline states only "${descCol.slice(0, 60)}" — the ${count} `
          + 'questions themselves are not written yet. Author them in course.json before importing.');
      }
      if (min !== null && /each/i.test(est || '')) min *= count;
    }

    // A reading priced "5 mins each" covering several articles states the count in its label;
    // this outline gives each reading its own row, so the multiplier is 1 unless one appears.
    if (type === 'Reading' && min !== null && /each/i.test(est || '')) {
      const count = +((titleCol.match(/\((\d+)\)/) || [])[1]) || 1;
      min *= count;
    }

    if (min === null) {
      min = 5;
      warnings.push(`${where} ${type} "${name}": no Est. Time in source, assumed ${min} mins`);
    }
    if (!name) {
      name = type;
      warnings.push(`${where}: no Learning Item Title in source, named "${name}"`);
    }

    // Names too short for Coursera, corrected by outline position. See NAME_FIXUPS above.
    const vkey = (section === null && mod && les && !moduleLevel && type === 'Video')
      ? `M${mod.number}L${les.number}V${les.items.filter(i => i.type === 'Video').length + 1}` : null;
    const fixup = vkey && NAME_FIXUPS[vkey];
    if (fixup && name === fixup.from) {
      warnings.push(`${where}: "${fixup.from}" is under the ${MIN_ITEM_NAME}-character minimum `
        + `Coursera enforces on item names — renamed to "${fixup.to}"`);
      name = fixup.to;
    } else if (fixup) {
      warnings.push(`${where}: NAME_FIXUPS has an entry for ${vkey} expecting "${fixup.from}", `
        + `but the outline now says "${name}" — not applied. Check whether the entry is still needed.`);
    }

    if (!desc) warnings.push(`${where} ${type} "${name}": no description in source`);

    // One IVQ per instructional video. A module introduction is not instructional — it frames
    // the module — and neither are the course-level videos, which sit outside any module.
    // 18 of the 20 video rows qualify, which is exactly what Part 1 promises.
    const instructional = type === 'Video' && section === null && !moduleLevel && !isModuleIntro(name);

    target.push({
      type,
      name,
      desc,
      min,
      ivq: instructional ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: `Outline: ${where} – ${type}${typedFrom === 'format' ? ` (typed from format "${format}")` : ''}`,
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
  const ids = m.alignedLOs || [];
  const resolved = ids.filter(lo => courseLOs[lo]);
  for (const lo of ids) {
    if (!courseLOs[lo]) warnings.push(`Module ${m.number}: aligned objective ${lo} has no text in Part 1`);
  }
  if (!ids.length) warnings.push(`Module ${m.number}: no aligned learning objective`);
  m.objectives = resolved.map(lo => courseLOs[lo]);
  if (resolved.length) {
    m.description += '\n\n'
      + (resolved.length > 1 ? 'Aligned course learning objectives:' : 'Aligned course learning objective:')
      + '\n' + resolved.map(lo => `${lo} — ${courseLOs[lo]}`).join('\n');
  }
  delete m.alignedLOs;
  if (!m.name) warnings.push(`Module ${m.number}: no "Title of the Module" line`);
  if (!m.description) warnings.push(`Module ${m.number}: no description`);
  for (const l of m.lessons) if (!l.name) warnings.push(`Module ${m.number} Lesson ${l.number}: no title line`);
}

// Five objectives, two modules, one aligned each. Legal — nothing assumes a 1:1 mapping — but
// the description promises all five, so the three no module claims are named.
{
  const aligned = new Set(course.modules.flatMap(m => m.objectives));
  const orphans = Object.entries(courseLOs).filter(([, text]) => !aligned.has(text)).map(([lo]) => lo);
  if (orphans.length) {
    warnings.push(`${orphans.join(', ')} ${orphans.length > 1 ? 'are' : 'is'} stated in Part 1 but `
      + 'aligned to no module — the description promises outcomes no module is accountable for');
  }
}

// Any name still under the minimum after NAME_FIXUPS. The builder refuses to write one, so
// this surfaces it in --report rather than at the build, where it is less obvious which
// outline row is at fault.
for (const m of course.modules) {
  for (const l of m.lessons) {
    for (const i of l.items) {
      if ((i.name || '').trim().length < MIN_ITEM_NAME) {
        warnings.push(`${i.ref || `Module ${m.number}`}: item name "${i.name}" is `
          + `${(i.name || '').trim().length} characters — Coursera requires ${MIN_ITEM_NAME} and drops `
          + 'shorter rows. Add a NAME_FIXUPS entry or lengthen it in the outline.');
      }
    }
  }
}

// Part 1's stated totals against what Part 2's tables actually contain. A mismatch is a source
// defect either way round — the tables are authoritative, but the claim is what a reviewer
// reads first, so it is named rather than quietly overruled.
{
  const items = course.modules.flatMap(m => m.lessons.flatMap(l => l.items));
  const actual = {
    ivq: items.filter(i => i.ivq).length,
    lab: items.filter(i => i.type === 'Peer Review' && /^hands[-\s]?on/i.test(i.name)).length,
    dpq: items.filter(i => i.type === 'Discussion Prompt').length * 2,
  };
  const label = { ivq: 'IVQs', lab: 'hands-on labs', dpq: 'DPQ questions' };
  for (const k of Object.keys(claimed)) {
    if (claimed[k] !== null && claimed[k] !== actual[k]) {
      warnings.push(`Part 1 claims ${claimed[k]} ${label[k]}, Part 2's tables give ${actual[k]}`);
    }
  }
}

writeJson(course, warnings);

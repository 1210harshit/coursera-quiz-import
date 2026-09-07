// Soft Skills for Work and Life — outline .docx -> course.json for the course-content
// importer (modules, lessons, items), not the quiz builder.
//
// Source shape is genai-marketing's: Part 2 holds "Module N: Title" and "Lesson N: Title"
// headings carrying the name inline, and one learning-items table per lesson. Two tables sit
// outside any lesson — "Introduction to the Entire Course" and "Supplementary Items for the
// Entire Course" — and Coursera has nowhere to put a course-level item, so both are folded
// into lessons. See PLACEMENT below.
//
// What is new here is the item vocabulary. This outline names eight kinds lib-outline-course's
// itemType() has never seen, so they are mapped in EXTRA_ITEM_TYPES below rather than by
// widening the shared function — every one of them is this template's wording, not a general
// Starweaver label.
//
// Two structural points, both checked rather than assumed:
//
//   * an instructional video is a row labelled exactly "Video". The course welcome and wrap-up
//     are "Video Intro" and "Video Outro"; they carry no in-video question, and the exact-match
//     test is what keeps them out of the IVQ count. The outline promises "one embedded question
//     per instructional video" against 16 such rows, and 16 is what this parser emits.
//   * "Pathway Gate (before Module 1)" and "Closing Items" are prose sections with no table of
//     their own. They still clear module and lesson scope, so that if a later revision adds a
//     table under either, it is reported as homeless rather than silently appended to whichever
//     lesson happened to precede it.
//
// The outline states no "Lead Instructor:" line at all, which is reported — see the same note
// in soft-skills-parse-outline.js.
//
// "Aligned Learning Objective:" states the objective in full, module-specific wording rather
// than naming an id. That fuller text is the better module objective, so it is used as written;
// the Part 1 objective it derives from is resolved separately, by opening verb, and recorded in
// the module description so the alignment stays visible to an editor.
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'soft-skills';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];

// PLACEMENT — the Dummies convention, and the one place this parser departs most from the
// generic pipeline. Every other course in this repository has nowhere to hang a course-level
// item, so it folds the intro table into module 1 lesson 1 and the supplementary table into an
// extra lesson on the last module. Here both tables become MODULES of their own:
//
//   "Introduction to the Entire Course"        -> module 1, its rows its learning items
//   the outline's own modules 1-4              -> modules 2-5, unchanged
//   "Supplementary Items for the Entire Course" -> a final module named below
//
// Coursera cannot hold an item that belongs to no lesson, so each of the two new modules gets a
// single lesson carrying its name. Module numbering is assigned after the whole outline is
// read, so the outline's own "Module 1" is module 2 in the workbook and nothing in the parse
// depends on the shift.
//
// This renumbering is CONFINED TO THE COURSE-CONTENT SIDE. The quiz pipeline's
// M<x>L<y>V<z> codes are written against the outline's own numbering — the graded quiz for
// "Laying Down a Solid Foundation" says M1L1V1, not M2L1V1 — so soft-skills-parse-outline.js
// keeps the original numbers and must not be changed to match this file.
const INTRO_MODULE = 'Introduction to the Entire Course';
const WRAPUP_MODULE = 'Course Wrap-Up and Next Steps';

// Item labels this template uses that lib-outline-course does not know. Consulted BEFORE
// itemType(), because "Practice Quiz" and "Interactive Assessment" would otherwise fall through
// to null, "Graded Assessment" does not match its /^graded\s*quiz/ pattern, and "Coach Dialogue"
// would not reach the type this course wants.
//
// THIS MAPPING IS THE COURSE OWNER'S, NOT A DERIVATION. The right-hand column is the name of the
// LEARNING ITEM TYPE IN COURSERA, given by the owner so the importer picks that exact type. Do
// not substitute a "nearer" type because the bundled Course Template predates one of these —
// the template's list is older than the platform's, and the owner's names are the current ones.
//
// The first upload of this workbook lost 17 rows, and every one of them was a name that is not
// Coursera's:
//
//   asked for   returned                                    corrected to
//   ---------   ----------------------------------------    -------------------
//   Quiz        "Item type Quiz is not supported"  (8)       Practice Assignment
//   Quizzes     ITEM_TYPE_UNSET / "Invalid item type" (1)    Practice Assignment
//   Dialogue    ITEM_TYPE_UNSET / "Invalid item type" (4)    Dialogue  (confirmed correct)
//   Roleplay    ITEM_TYPE_UNSET / "Invalid item type" (4)    Roleplay  (confirmed correct)
//
// ITEM_TYPE_UNSET means Coursera read no type at all, which is what an unrecognised string
// produces — not a verdict on the item. The workbook was never at fault: a Roleplay cell is
// byte-identical in encoding and style to a Peer Review cell that imported in the same upload.
//
// "Graded Assessment" also moves, from Assignment to Graded Assignment. Assignment did import,
// so this is not a fix — it is the owner naming the type they actually want the item to be.
const EXTRA_ITEM_TYPES = [
  [/^infographic/i,                     'Reading'],
  [/^pre[-\s]?course\s*diagnostic/i,    'Reading'],
  // The pre-course diagnostic. Not named explicitly by the owner; it is an ungraded,
  // non-blocking, retakeable self-assessment, which is the same item a practice quiz is.
  [/^interactive\s*assessment$/i,       'Practice Assignment'],
  [/^recommended\s*learning\s*path$/i,  'Reading'],
  [/^coach\s*dialogue$/i,               'Dialogue'],
  [/^practice\s*quiz$/i,                'Practice Assignment'],
  [/^discussion\s*prompt$/i,            'Discussion Prompt'],
  [/^hands[-\s]?on\s*lab$/i,            'Peer Review'],
  [/^roleplay$/i,                       'Roleplay'],
  [/^the\s*part\s*of\s*tens$/i,         'Reading'],
  [/^cheat\s*sheet$/i,                  'Reading'],
  [/^course[-\s]?end\s*project$/i,      'Peer Review'],
  [/^graded\s*assessment$/i,            'Graded Assignment'],
];

// The item types the bundled Course Template ships in its Ranges master list ($E$3:$E$11).
// A type outside this set is not necessarily wrong — Coursera has item types the template
// predates, and the owner may legitimately want one — but it IS the set that has been observed
// to import. Anything else is reported on every run so a silent drop cannot happen twice:
// course-import-build.js appends an unknown type to the Ranges sheet and the verifier then
// passes, so without this notice a workbook that loses rows looks completely clean.
const TEMPLATE_ITEM_TYPES = new Set([
  'Video', 'Reading', 'Discussion Prompt', 'Graded Discussion Prompt', 'Programming',
  'Peer Review', 'App item', 'Ungraded Lab', 'Assignment',
]);
// Names this course has seen Coursera refuse, and what replaced them. Kept so a later edit that
// reintroduces one is recognised as a regression rather than rediscovered on an upload.
const REJECTED_BEFORE = {
  Quiz: '"Item type Quiz is not supported" — replaced by Practice Assignment',
  Quizzes: 'ITEM_TYPE_UNSET / "Invalid item type" — replaced by Practice Assignment',
};
// type -> the outline label that produced it, for the notice emitted at the end.
const offTemplate = new Map();
function resolveType(label) {
  const l = clean(label || '');
  let type = null;
  for (const [re, t] of EXTRA_ITEM_TYPES) if (re.test(l)) { type = t; break; }
  if (!type) type = itemType(l);
  // Reported, not fatal: the owner chooses the type, and Coursera has items the bundled template
  // predates. But a type outside the template's list has already cost this course 17 silently
  // dropped rows, so every run says so rather than letting the next upload discover it.
  if (type && !TEMPLATE_ITEM_TYPES.has(type) && !offTemplate.has(type)) {
    offTemplate.set(type, l);
  }
  return type;
}

// An instructional video: labelled exactly "Video", inside a lesson. "Video Intro" and
// "Video Outro" are course-level and carry no in-video question.
const isLessonVideo = label => /^video$/i.test(clean(label || ''));

const course = {
  title: '', description: '', offeringType: 'Private', sme: '', modules: [],
};
const intro = [];
const wrapUp = [];

let section = null;            // 'intro' | 'supplementary' | 'other' | null
let mod = null, les = null;
let pendingDesc = null;
let inPart2 = false;

const courseDesc = [];
const courseLOs = {};          // "LO1" -> text

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    if ((m = t.match(/^Course Title\s*:\s*(.+)$/i)))    { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Course Subtitle\s*:\s*(.+)$/i))) { courseDesc.unshift(m[1].trim(), ''); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) { course.sme = m[1].trim(); continue; }
    if (!inPart2 && (m = t.match(/^(LO\d+)\s*(?:\([^)]*\))?\s*[:\-–]\s*(.+)$/i))) {
      courseLOs[m[1].toUpperCase()] = m[2].trim();
      continue;
    }
    if ((m = t.match(/^(Level|Prerequisites)\s*:\s*(.+)$/i))) {
      courseDesc.push(`${m[1]}: ${m[2].trim()}`); continue;
    }

    if (/^Part\s*2\b/i.test(t)) { inPart2 = true; continue; }
    if (/^Appendix\s*:/i.test(t)) break;          // this outline has no Part 3

    if (!inPart2) {
      // Everything between the description heading and "What You Will Learn" is the blurb.
      if (/^Course Description\s*:?$/i.test(t)) { pendingDesc = 'course'; continue; }
      if (/^(What You Will Learn|How This Course|Duration|Audience|Main Outcome|Key Takeaways|Skills Included|SEO Keywords|Category|Subcategory|Proof of Learning|Learning Objectives)\b/i.test(t)) {
        pendingDesc = null; continue;
      }
      if (pendingDesc === 'course') courseDesc.push(t);
      continue;
    }

    // Course-level sections. "Pathway Gate" and "Closing Items" carry no table of their own,
    // but they still clear scope — see the header comment.
    if (/^Introduction to (the )?Entire Course/i.test(t)) { section = 'intro'; mod = les = null; continue; }
    if (/^Supplementary Items/i.test(t))                  { section = 'supplementary'; mod = les = null; continue; }
    if (/^(Pathway Gate|Closing Items)/i.test(t))         { section = 'other'; mod = les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*:\s*(.+)$/i))) {
      section = null;
      mod = { number: m[1], name: m[2].trim(), description: '', objectives: [], lessons: [] };
      course.modules.push(mod);
      les = null; pendingDesc = 'module';
      continue;
    }
    // Lesson numbering restarts at 1 inside every module, and the number is kept in the name —
    // Coursera shows the lesson name in the outline, not the number column.
    if ((m = t.match(/^Lesson\s+(\d+)\s*:\s*(.+)$/i)) && mod) {
      section = null;
      les = { number: m[1], name: `Lesson ${m[1]}: ${m[2].trim()}`, items: [] };
      mod.lessons.push(les);
      pendingDesc = 'lesson';
      continue;
    }
    if ((m = t.match(/^Aligned Learning Objectives?\s*:\s*(.+)$/i)) && mod) {
      mod.alignedText = m[1].trim();
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
    const type = resolveType(label);
    if (!type) { warnings.push(`unrecognised item label "${label}" — skipped`); continue; }

    let min = minutes(est);
    if (min === null) {
      min = 5;
      warnings.push(`${label} "${title || desc.slice(0, 40)}": no Est. Time in source, assumed ${min} mins`);
    }

    // Two rows in the course-intro table state a Learning Items label and no title. The label
    // is the only name available and is long enough to survive Coursera's 5-character rule,
    // but it is named here because a title is what an editor would expect to see.
    if (!title) warnings.push(`${label}: no Learning Item Title in source — the label is used as the name`);

    const instructional = isLessonVideo(label) && section === null;

    target.push({
      type,
      name: title || label,
      desc,
      min,
      ivq: instructional ? 1 : 0,
      vtype: type === 'Video' ? videoType(format) : undefined,
      link: /^https?:\/\//i.test(link || '') ? link.trim() : undefined,
      ref: `Outline: ${section === 'intro' ? 'Introduction to the Entire Course'
            : section === 'supplementary' ? 'Supplementary Items'
            : `M${mod.number} L${les.number}`} – ${label}`,
    });
  }
}

// --- promote the two course-level tables to modules of their own -------------------------
// See PLACEMENT. Each gets one lesson, because Coursera has no home for a lesson-less item.
const asModule = (name, items) => ({
  number: '0',                                   // real numbers assigned below
  name,
  description: '',
  objectives: [],
  lessons: [{ number: '1', name: `Lesson 1: ${name}`, items }],
});

if (intro.length) course.modules.unshift(asModule(INTRO_MODULE, intro));
else warnings.push(`no "${INTRO_MODULE}" items table found — the course has no introduction module`);

if (wrapUp.length) course.modules.push(asModule(WRAPUP_MODULE, wrapUp));
else warnings.push(`no "Supplementary Items" table found — the course has no "${WRAPUP_MODULE}" module`);

// Numbering runs 1..n over the final shape, so the outline's "Module 1" becomes module 2.
course.modules.forEach((m, i) => { m.number = String(i + 1); });

// --- course description -----------------------------------------------------------------
const loIds = Object.keys(courseLOs).sort();
if (loIds.length) {
  courseDesc.push('', 'By the end of this course, you will be able to:',
    ...loIds.map(id => '• ' + courseLOs[id]));
}
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();

// --- module objectives --------------------------------------------------------------------
// The outline's aligned objective is module-specific and fuller than the Part 1 text, so it is
// the objective. The Part 1 id it derives from is resolved by opening verb — unique across
// LO1-LO4 here — and recorded in the description. A non-unique match is reported, never guessed.
// The introduction and wrap-up modules are this parser's own, not the outline's, so neither
// carries an aligned objective and neither is expected to — warning about them would be noise.
const SYNTHETIC = new Set([INTRO_MODULE, WRAPUP_MODULE]);
for (const m of course.modules) {
  if (m.alignedText) {
    m.objectives = [m.alignedText];
    const verb = (m.alignedText.match(/^([A-Za-z]+)/) || [null, ''])[1].toLowerCase();
    const hits = loIds.filter(id => courseLOs[id].toLowerCase().startsWith(verb + ' '));
    if (hits.length === 1) {
      m.description += `\n\nAligned course learning objective: ${hits[0]} — ${courseLOs[hits[0]]}`;
    } else {
      warnings.push(`Module ${m.number}: aligned objective opens "${verb}", which matches `
        + `${hits.length} Part 1 objectives (${hits.join(', ') || 'none'}) — no LO id recorded`);
    }
  } else {
    m.objectives = [];
    if (!SYNTHETIC.has(m.name)) {
      warnings.push(`Module ${m.number}: no aligned learning objective in source`);
    }
  }
  delete m.alignedText;
  for (const l of m.lessons) delete l.description;
}

if (!course.sme) {
  warnings.push('no "Lead Instructor:" line in the outline — the course SME is left blank');
}

// Item types outside the bundled template's list. Named on every run, with the message Coursera
// returned last time where there is one, because the failure mode is a SILENT drop: the build
// appends the type to the Ranges sheet, the verifier passes, and only the upload reveals the
// loss. See the note above EXTRA_ITEM_TYPES.
for (const [type, label] of offTemplate) {
  const n = course.modules.flatMap(m => m.lessons.flatMap(l => l.items))
    .filter(i => i.type === type).length;
  warnings.push(`item type "${type}" (from "${label}", ${n} row${n === 1 ? '' : 's'}) is not in the `
    + 'bundled Course Template\x27s list'
    + (REJECTED_BEFORE[type] ? `, and Coursera refused it on a previous upload: ${REJECTED_BEFORE[type]}. `
        + 'If it is refused again, vary the SPELLING — the cell itself is written correctly.'
      : '. It has not been import-tested.')
    + ' Import ONE module and check the item count before relying on the workbook.');
}

// The outline promises "one embedded question per instructional video" against its 16 topic
// videos. Reported whenever the parse does not produce exactly that.
{
  const items = course.modules.flatMap(m => m.lessons.flatMap(l => l.items));
  const ivqs = items.filter(i => i.ivq).length;
  if (ivqs !== 16) {
    warnings.push(`${ivqs} in-video questions, but the outline promises one per instructional `
      + 'video against 16 topic videos — check which rows were counted as lesson videos');
  }
}

writeJson(course, warnings);

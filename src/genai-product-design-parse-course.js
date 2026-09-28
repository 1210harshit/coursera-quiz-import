// GenAI for Product Designers — outline .docx -> course.json for the
// course-content importer.
//
// The same source shape as ai-toolkit and google-ads: bare "Module N" / "Lesson N" headings
// with the name on a following "Title of the Module:" line, video descriptions prefixed with a
// literal "Description: " label, "Aligned Learning Objective: LO4" stating only the id, and a
// Lead Instructor still set to the template placeholder. Notes on this one:
//
//   * the most complete of the three — the Course-end Project and Promo video rows both carry
//     a title and a description, so neither fallback below fires
//   * Reading rows are labelled "Reading (1)" and priced "5 mins each" — the count is in the
//     label, so "each" multiplies by the count in the label rather than by a description count
//   * durations are written "<=4 mins" and "<=2 mins" on the two course-level videos
//   * Part 1's "Proof of Learning" claims 234 IVQs where the tables hold 233. The check at the
//     bottom of this file is what found that; the tables are taken as authoritative
//
// Part 1 also carries a tool-application table ("Field" / "Tool Name" / …). It is ignored
// because isItemHeader only accepts a table whose first cell is "Learning Items".
const path = require('path');
const {
  readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson,
} = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'genai-product-design';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const WRAPUP_LESSON = 'Course Wrap-Up and Final Assessment';
const DPQ_PLACEHOLDER = /^\d+\s+open[-\s]ended questions?\.?$/i;

// ============================================================================================
// TWO TABLE SHAPES IN ONE OUTLINE, and the header does not reliably tell them apart:
//
//   | Learning Items | Learning Item Title | Video Format | High level Description | Est. Time | Link |
//   |                | Learning Item Title | Video Format | High level Description | Est. Time | Link |
//   | Learning Item Title | Video Format | High level Description | Est. Time | Link |
//
// The first is a lesson table as paid-social writes it. The second is the SAME table with its
// first header cell left blank — and that is seven of this outline's nine lesson tables, so
// lib-outline-course's isItemHeader(), which requires the literal "Learning Items", recognises
// exactly one of them. The third is ai-products' shape, with no label column at all; the
// course-level and module-extras tables use it.
//
// The reliable signal is WHERE "Learning Item Title" sits: cell 1 means a label column precedes
// it, cell 0 means there is none. Row reading then offsets by one, or does not.
const HDR_TITLE = /^Learning Item Title$/i;
const HDR_LABEL = /^Learning Items?$/i;
function tableShape(hdr) {
  const c = (hdr || []).map(x => clean(cellText(x) || ''));
  if (HDR_TITLE.test(c[1] || '') && (HDR_LABEL.test(c[0] || '') || !c[0])) return 'labelled';
  if (HDR_TITLE.test(c[0] || '')) return 'plain';
  return null;
}

// For a 'plain' row the kind comes from the Video Format column, as in ai-products.
const VIDEO_FORMAT = f =>
  /^(talking\s*head|conceptual|demo|screenshare|screen\s*capture|slides?|interview|animation)\b/i
    .test(clean(f || ''));
// Deviates from ai-products in one entry, deliberately. It maps "Interactive" to Roleplay;
// Coursera's importer has refused "Roleplay" on three uploads across two courses, so those rows
// would be silently dropped. The two Interactive items here are scenario exercises that end in a
// submitted artefact ("Defending Research Quality in an AI-Supported UX Review"), which is what
// the Activity/Exercise rows beside them already are, so they take the same proven type.
// Every value below is in OBSERVED_IMPORTS — see the check after the parse.
const FORMAT_TYPES = [
  [/^reading\b/i,                                        'Reading'],
  [/^discussion\b/i,                                     'Discussion Prompt'],
  [/^(activity|exercise|activity\s*\/\s*exercise|hands)\b/i, 'Peer Review'],
  [/^(interactive|role\s*play)\b/i,                      'Peer Review'],
  [/^graded\s*assessment\b/i,                            'Assignment'],
  [/^(capstone|project)\b/i,                             'Peer Review'],
];
// A production format means the row is a video; anything else names a Coursera kind directly.
const formatType = f => (VIDEO_FORMAT(f)
  ? 'Video'
  : (FORMAT_TYPES.find(([re]) => re.test(clean(f || ''))) || [])[1] || null);

// The strings Coursera's importer has actually accepted. Checked after the parse so a type this
// course introduces cannot repeat the silent-drop failure that cost emotional-intelligence three
// uploads. See the OBSERVED_REFUSED note in emotional-intelligence-parse-course.js.
const OBSERVED_IMPORTS = new Set([
  'Video', 'Reading', 'Discussion Prompt', 'Peer Review', 'Assignment', 'Practice Assignment',
]);

// M1L1 labels its module-introduction row "Intro Video"; M2L1 writes "Into Video". The typo is
// the source's. itemType() matches /^intro\s*video/ and would reject the second, dropping a real
// row, so the label is repaired before lookup rather than the pattern being loosened for every
// course that shares lib-outline-course.
const fixLabel = l => clean(l || '').replace(/^Into(\s+Video)\b/i, 'Intro$1');

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
      // "Proof of Learning" states how many IVQs, labs and DPQs the course is supposed to
      // have. Those numbers are written by hand and drift from the tables below, so they are
      // captured and checked rather than trusted.
      if ((m = t.match(/^In-Video Questions \(IVQs\)\s*:\s*(\d+)/i)))        { claimed.ivq = +m[1]; continue; }
      if ((m = t.match(/^Hands[- ]on Lab Activities\s*:\s*(\d+)/i)))         { claimed.lab = +m[1]; continue; }
      if ((m = t.match(/^Discussion Prompt Questions \(DPQs\)\s*:\s*(\d+)/i))) { claimed.dpq = +m[1]; continue; }

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
  if (!rows.length) continue;
  const shape = tableShape(rows[0]);
  if (!shape) continue;                    // Part 1's "Field | Details" tables

  const target = section === 'intro' ? intro : section === 'supplementary' ? wrapUp : les && les.items;
  if (!target) { warnings.push(`items table outside any lesson, skipped: ${rows[1] && rows[1][1]}`); continue; }

  const where = section === 'intro' ? 'Introduction to Entire Course'
              : section === 'supplementary' ? 'Supplementary Items'
              : `M${mod.number} L${les.number}`;

  for (const cells of rows.slice(1)) {
    const raw = cells.map(cellText);
    // A 'plain' row has no label column, so everything shifts left by one and the row's kind
    // has to be derived: the TITLE first, because itemType() already knows "DPQ", "Graded Quiz"
    // and "Promo Video", then the Video Format column, which in that shape doubles as the kind.
    let label, titleCol, format, descCol, est, link, type;
    if (shape === 'labelled') {
      [label, titleCol, format, descCol, est, link] = raw;
      label = fixLabel(label);
      type = itemType(label);
    } else {
      [titleCol, format, descCol, est, link] = raw;
      label = titleCol;                                  // for the messages below
      type = itemType(titleCol) || formatType(format);
    }
    if (!type) {
      warnings.push(`${where}: unrecognised item "${label}"`
        + (shape === 'plain' ? ` with Video Format "${format}"` : '') + ' — skipped');
      continue;
    }

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
      // This outline states neither: the title column is the bare abbreviation "DPQ" and the
      // description says what the item will contain rather than carrying the questions. "DPQ"
      // is three characters, and course-import-build.js refuses any name under five because
      // Coursera drops those rows on import — so the row would be lost either way. Renaming it
      // to the type's own words is the smallest honest fix; the questions still have to be
      // written into the outline before this item is worth publishing.
      if (clean(name).toUpperCase() === 'DPQ') {
        name = 'Discussion Prompt';
        warnings.push(`${where} DPQ: the source names this item "DPQ", which Coursera would drop `
          + `as too short, and states no questions — renamed to "${name}". Its two questions `
          + 'still need writing into the outline.');
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

// Part 1's stated totals against what Part 2's tables actually contain. A mismatch is a
// source defect either way round — the tables are authoritative, but the claim is what a
// reviewer reads first, so it is named rather than quietly overruled.
{
  const items = course.modules.flatMap(m => m.lessons.flatMap(l => l.items));
  const actual = {
    ivq: items.filter(i => i.ivq).length,
    lab: items.filter(i => /^Outline: M\d+ L\d+ – Hands[- ]on/i.test(i.ref)).length,
    dpq: items.filter(i => i.type === 'Discussion Prompt').length * 2,
  };
  const label = { ivq: 'IVQs', lab: 'hands-on labs', dpq: 'DPQ questions' };
  for (const k of Object.keys(claimed)) {
    if (claimed[k] !== null && claimed[k] !== actual[k]) {
      warnings.push(`Part 1 claims ${claimed[k]} ${label[k]}, Part 2's tables give ${actual[k]}`);
    }
  }
}

// Every item type must be one the importer has actually accepted. Coursera matches the exact
// string against a closed list and silently drops the rest, keeping the remainder of the
// upload, so a type outside the set costs rows without failing anything locally: the build
// appends it to the Ranges sheet and course-import-verify.js still passes. emotional-
// intelligence lost 17, 12 and then 21 rows learning this. Reported, not fatal — the owner may
// deliberately want a type no upload has exercised yet — but never silent.
{
  const seen = new Map();
  for (const it of course.modules.flatMap(m => m.lessons.flatMap(l => l.items))) {
    if (!OBSERVED_IMPORTS.has(it.type) && !seen.has(it.type)) seen.set(it.type, it.name);
  }
  for (const [type, name] of seen) {
    const n = course.modules.flatMap(m => m.lessons.flatMap(l => l.items))
      .filter(i => i.type === type).length;
    warnings.push(`item type "${type}" (${n} row${n === 1 ? '' : 's'}, e.g. "${name}") has never been `
      + 'seen to import. Coursera matches the exact string against a closed list, so the rows may '
      + 'be dropped silently. Import ONE module and compare the item count.');
  }
}

writeJson(course, warnings);

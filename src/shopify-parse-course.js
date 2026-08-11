// Complete Shopify Dropshipping — outline .docx -> course.json for the course-content
// importer.
//
// The first course-content parser NOT written against the Starweaver outline template. This
// source is a design document, so nothing in ai-toolkit / google-ads / paid-social applies:
// there is no "Learning Items" table, no "Title of the Module:" line, no per-item Est. Time
// column, and no Lead Instructor at all. What it has instead:
//
//   ┌ PART 2 — MODULE-BY-MODULE PLAN ┐                    single-cell banner table
//   ┌ MODULE 1 OF 4  |  LO1          ┐                    single-cell heading table:
//   │ Foundations: Set Up Your …     │                      id line, module name,
//   │ Learner goal: …                ┘                      learner goal
//   <module description paragraph>
//   📊 Module 1 contents: 5 lessons · 26 videos · …        stats line, checked not consumed
//   Lesson 1.1 — The Essentials  (Section 1)
//   ┌ #     │ Video Title  │ Description ┐                 the lesson's videos
//   ┌ Type  │ Activity     │ Duration    ┐                 its reading and practice quiz
//   Module 1 — Hands-on Lab & Graded Assessment
//   ┌ Type  │ Activity     │ Duration    ┐                 its lab and graded quiz
//
// and a PART 3 holding two roleplays and the final project.
//
// Item mapping. Everything except the practice quiz has an established home; see
// lib-outline-course.js for why a hands-on lab is a Peer Review rather than an Ungraded Lab.
//
//   | Video (1.1.1)  | Video       |
//   | Reading        | Reading     |
//   | Practice Quiz  | Quiz        | ungraded, unlimited retakes — see below
//   | Hands-on Lab   | Peer Review |
//   | Graded Quiz    | Assignment  |
//   | ROLEPLAY       | Roleplay    |
//   | FINAL PROJECT  | Peer Review |
//
// `Quiz` is Coursera's ungraded practice quiz. Like `Roleplay` it postdates the bundled Course
// Template, so it is absent from that workbook's Ranges lookup and course-import-build.js
// appends it at build time — the same path Roleplay already takes. Nothing here needs to know
// that; the builder prints a WARN naming every type it had to append.
//
// Durations. The video tables carry none. Two statements in the source bear on it: "Total
// Video Runtime ~9 hours" over 97 videos, and a production note that "every video keeps a
// consistent length: 4-8 minutes per video". Both land on 6 minutes, so that is used and
// warned about once rather than per video. Every other item states its own duration, but in
// mixed units — "60-90 min", "3 hours of focused work", "4-6 hours" — so this parser carries
// its own hours-aware duration reader instead of lib-outline-course's minutes().
const path = require('path');
const { readBlocks, clean, writeJson } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'shopify';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warnings = [];
const MIN_ITEM_NAME = 5;                      // must match course-import-build.js
const VIDEO_MINUTES = 6;                      // "4-8 minutes per video", midpoint

// Coursera drops any item whose name is under five characters, so a shorter one has to be
// lengthened before the build. Keyed by outline position rather than by the bare word, since
// the same word may be a perfectly good name elsewhere.
//
// M2L3V4 sits in "Customer Service" beside "Contact Us Form" and "Setting Up Live Chat";
// its description reads "Builds a Frequently Asked Questions page …", so it is that page.
const NAME_FIXUPS = {
  M2L3V4: { from: 'FAQ', to: 'FAQ Page' },
};

// "8 min" -> 8; "60-90 min" -> 75; "3 hours of focused work" -> 180; "4-6 hours" -> 300.
// A range collapses to its midpoint, as everywhere else here; the unit is read from the text
// rather than assumed, which lib-outline-course's minutes() does not do.
function duration(text) {
  const t = String(text || '').replace(/[–—]/g, '-').trim();
  if (!t) return null;
  const range = t.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  const one = t.match(/(\d+(?:\.\d+)?)/);
  if (!range && !one) return null;
  const value = range ? (+range[1] + +range[2]) / 2 : +one[1];
  const hours = /\bh(?:r|rs|our|ours)?\b/i.test(t);
  return Math.round(hours ? value * 60 : value);
}

const course = { title: '', description: '', offeringType: 'Private', sme: '', modules: [] };
const courseLOs = {};
const moduleLO = {};                          // "1" -> "LO1"
const courseDesc = [];
const stats = {};                             // Part 1's "Course at a Glance" numbers
const trailing = [];                          // PART 3 items, placed per the source's own advice

let part = 0, mod = null, les = null, awaitDesc = false;

const VIDEO_HEADER = c => /^#$/.test(clean(c[0] || '')) && /^Video Title$/i.test(clean(c[1] || ''));
const ACTIVITY_HEADER = c => /^Type$/i.test(clean(c[0] || '')) && /^Activity$/i.test(clean(c[1] || ''));

// An activity cell is title / description / optional "Source: <url>", one per paragraph.
function activity(cell) {
  const lines = String(cell || '').split('\n').map(clean).filter(Boolean);
  const link = (lines.find(l => /^Source\s*:\s*https?:\/\//i.test(l)) || '')
    .replace(/^Source\s*:\s*/i, '');
  const body = lines.filter(l => !/^Source\s*:\s*https?:\/\//i.test(l));
  return { name: body[0] || '', desc: body.slice(1).join('\n'), link: link || undefined };
}

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    if (/^Course Description$/i.test(t)) { awaitDesc = true; continue; }
    if (/^Course at a Glance$/i.test(t)) { awaitDesc = false; continue; }
    if (awaitDesc && part === 0) { courseDesc.push(t); continue; }

    if ((m = t.match(/^Lesson\s+(\d+)\.(\d+)\s*[—–-]\s*(.+?)(?:\s*\(Section\s*\d+\))?$/i))) {
      if (/Practice Quiz$/i.test(m[3])) continue;          // a practice-quiz row, not a heading
      if (!mod) { warnings.push(`Lesson ${m[1]}.${m[2]} appears before any module`); continue; }
      les = { number: m[2], name: `Lesson ${m[2]}: ${clean(m[3])}`, items: [] };
      mod.lessons.push(les);
      continue;
    }

    // "Module 1 — Hands-on Lab & Graded Assessment" closes the module's lessons; its table's
    // items belong to a lesson of their own so they do not land inside the last content lesson.
    if ((m = t.match(/^Module\s+(\d+)\s*[—–-]\s*Hands-on Lab\s*&\s*Graded Assessment/i))) {
      if (!mod) { warnings.push(`assessment block for module ${m[1]} appears before any module`); continue; }
      const n = mod.lessons.length + 1;
      les = { number: String(n), name: `Lesson ${n}: Hands-on Lab and Graded Assessment`, items: [] };
      mod.lessons.push(les);
      continue;
    }

    // The stats line is checked against what the tables actually hold, not consumed.
    if ((m = t.match(/^📊?\s*Module\s+(\d+)\s+contents\s*:\s*(.+)$/i)) && mod) {
      mod._claimed = {};
      for (const cm of m[2].matchAll(/(\d+)\s+(lessons?|videos?|practice questions?|graded questions?|hands-on labs?)/gi)) {
        mod._claimed[cm[2].toLowerCase().replace(/s$/, '')] = +cm[1];
      }
      continue;
    }

    // The paragraph straight after a module heading table is its description.
    if (mod && !mod.description && !les && part === 2) { mod.description = t; continue; }
    continue;
  }

  // ---- tables ----
  const rows = b.rows;
  if (!rows.length) continue;

  if (rows.length === 1 && rows[0].length === 1) {
    const lines = (rows[0][0] || '').split('\n').map(clean).filter(Boolean);
    let m;
    if ((m = (lines[0] || '').match(/^PART\s*(\d+)/i))) { part = +m[1]; mod = les = null; continue; }
    if ((m = (lines[0] || '').match(/^MODULE\s+(\d+)\s+OF\s+\d+\s*\|\s*(LO\d+)/i))) {
      mod = { number: m[1], name: lines[1] || '', description: '', objectives: [], lessons: [] };
      moduleLO[m[1]] = m[2].toUpperCase();
      course.modules.push(mod);
      les = null;
      if (!mod.name) warnings.push(`Module ${m[1]}: the heading block has no name line`);
      // "Learner goal: …" is the module's own statement of intent; it belongs in the
      // description rather than being dropped.
      const goal = lines.find(l => /^Learner goal\s*:/i.test(l));
      if (goal) mod._goal = goal;
      continue;
    }
    // PART 3 blocks: a type line, a title, a description, and an estimated time.
    if (part === 3 && /^(ROLEPLAY|FINAL PROJECT)$/i.test(lines[0] || '')) {
      const est = lines.find(l => /^Estimated time\s*:/i.test(l)) || '';
      const body = lines.slice(1).filter(l => !/^Estimated time\s*:/i.test(l));
      const min = duration(est.replace(/^Estimated time\s*:\s*/i, ''));
      if (min === null) warnings.push(`PART 3 ${lines[0]}: no estimated time, assumed 15 mins`);
      trailing.push({
        kind: /^ROLEPLAY$/i.test(lines[0]) ? 'roleplay' : 'project',
        type: /^ROLEPLAY$/i.test(lines[0]) ? 'Roleplay' : 'Peer Review',
        name: body[0] || lines[0],
        desc: body.slice(1).join('\n'),
        min: min === null ? 15 : min,
        ref: `Outline: PART 3 – ${lines[0]}`,
      });
      continue;
    }
    continue;
  }

  if (part === 1) {
    for (const cells of rows) {
      if (cells.length < 2) continue;
      const k = clean(cells[0]), v = clean(cells[1]);
      if (/^Course Title$/i.test(k)) course.title = v;
      else if (/^Subtitle$/i.test(k)) courseDesc.unshift(v, '');
      else if (/^(Level|Primary Audience|Format)$/i.test(k)) stats[k.toLowerCase()] = v;
      else if (/^Number of (Modules|Lessons|Videos)$/i.test(k)) stats[k.toLowerCase()] = +v || v;
      else if (/^(LO\d+)$/i.test(k)) courseLOs[k.toUpperCase()] = v;
    }
    continue;
  }

  if (!mod) continue;

  if (VIDEO_HEADER(rows[0])) {
    if (!les) { warnings.push(`M${mod.number}: a video table sits outside any lesson — skipped`); continue; }
    for (const cells of rows.slice(1)) {
      const num = clean(cells[0] || ''), name = clean(cells[1] || '');
      const desc = clean(cells[2] || '');
      const dm = num.match(/^(\d+)\.(\d+)\.(\d+)$/);
      const where = dm ? `M${dm[1]}L${dm[2]}V${dm[3]}` : `M${mod.number}L${les.number} "${num}"`;
      if (!dm) { warnings.push(`${where}: unreadable video number — skipped`); continue; }
      if (!name) { warnings.push(`${where}: no video title — skipped`); continue; }

      let title = name;
      const fixup = NAME_FIXUPS[where];
      if (fixup && title === fixup.from) {
        warnings.push(`${where}: "${fixup.from}" is under the ${MIN_ITEM_NAME}-character minimum `
          + `Coursera enforces on item names — renamed to "${fixup.to}"`);
        title = fixup.to;
      } else if (fixup) {
        warnings.push(`${where}: NAME_FIXUPS expects "${fixup.from}" but the outline now says `
          + `"${title}" — not applied. Check whether the entry is still needed.`);
      }

      les.items.push({
        type: 'Video', name: title, desc, min: VIDEO_MINUTES, ivq: 1,
        vtype: 'Screen capture',           // the course is a screen-recorded Shopify walkthrough
        ref: `Outline: ${where}`,
      });
    }
    continue;
  }

  if (ACTIVITY_HEADER(rows[0])) {
    if (!les) { warnings.push(`M${mod.number}: an activity table sits outside any lesson — skipped`); continue; }
    for (const cells of rows.slice(1)) {
      const kind = clean(cells[0] || '');
      const { name, desc, link } = activity(cells[1]);
      let min = duration(cells[2]);
      const where = `M${mod.number}L${les.number} ${kind}`;
      const type = /^Reading$/i.test(kind) ? 'Reading'
                 : /^Practice Quiz$/i.test(kind) ? 'Quiz'
                 : /^Hands-on Lab$/i.test(kind) ? 'Peer Review'
                 : /^Graded Quiz$/i.test(kind) ? 'Assignment'
                 : null;
      if (!type) { warnings.push(`${where}: unrecognised activity type "${kind}" — skipped`); continue; }
      if (min === null) { min = 10; warnings.push(`${where}: no duration in source, assumed ${min} mins`); }
      if (!name) { warnings.push(`${where}: no activity title — skipped`); continue; }
      les.items.push({ type, name, desc, min, ivq: 0, link, ref: `Outline: ${where}` });
    }
  }
}

// --- PART 3 placement ---------------------------------------------------------------------
// The source says where these go: "Roleplay 1 is recommended after Module 2; Roleplay 2 after
// Module 4." That is an instruction, so it is followed rather than dumping all three at the
// end. Each lands in a lesson of its own so it does not disturb a module's assessment lesson.
const PLACEMENT = { roleplay: [2, 4], project: [4] };
const usedRoleplay = [];
for (const item of trailing) {
  const seq = item.kind === 'roleplay' ? usedRoleplay.push(1) - 1 : 0;
  const target = (PLACEMENT[item.kind] || [])[seq];
  const m = course.modules.find(x => +x.number === target);
  if (!m) {
    warnings.push(`${item.ref}: no module ${target} to hold it — appended to the last module`);
  }
  const host = m || course.modules[course.modules.length - 1];
  if (!host) { warnings.push(`${item.ref}: no modules at all — dropped`); continue; }
  const n = host.lessons.length + 1;
  const kind = item.kind === 'roleplay' ? 'Roleplay Activity' : 'Course Final Project';
  host.lessons.push({ number: String(n), name: `Lesson ${n}: ${kind}`, items: [item] });
  warnings.push(`${item.ref} "${item.name}": placed on module ${host.number}. ` + (item.kind === 'roleplay'
    ? 'The outline says "Roleplay 1 is recommended after Module 2; Roleplay 2 after Module 4".'
    : 'The final project is the course capstone, so it goes on the last module.'));
}

// --- course description -------------------------------------------------------------------
const los = Object.keys(courseLOs).sort((a, b) => +a.slice(2) - +b.slice(2)).map(k => courseLOs[k]);
if (stats.level) courseDesc.push('', `Level: ${stats.level}`);
if (los.length) {
  courseDesc.push('', 'By the end of this course, you will be able to:', ...los.map(l => '• ' + l));
}
course.description = courseDesc.map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();

warnings.push(`no per-video duration in the source; every video assumed ${VIDEO_MINUTES} mins, `
  + 'the midpoint of the production note\'s "4-8 minutes per video"');
warnings.push('this outline has no Lead Instructor line — Writer/SME left blank');

for (const m of course.modules) {
  const lo = moduleLO[m.number];
  const text = lo ? courseLOs[lo] : null;
  if (text) {
    m.objectives = [text];
    m.description = [m.description, m._goal, `Aligned course learning objective: ${lo} — ${text}`]
      .filter(Boolean).join('\n\n');
  } else {
    m.objectives = [];
    warnings.push(`Module ${m.number}: aligned objective ${lo || '(none)'} has no text in Part 1`);
    m.description = [m.description, m._goal].filter(Boolean).join('\n\n');
  }
  // The module's own stats line against what its tables actually hold.
  if (m._claimed) {
    const content = m.lessons.filter(l => l.items.some(i => i.type === 'Video')).length;
    const videos = m.lessons.reduce((a, l) => a + l.items.filter(i => i.type === 'Video').length, 0);
    if (m._claimed.lesson && m._claimed.lesson !== content) {
      warnings.push(`Module ${m.number}: its contents line claims ${m._claimed.lesson} lessons, the tables give ${content}`);
    }
    if (m._claimed.video && m._claimed.video !== videos) {
      warnings.push(`Module ${m.number}: its contents line claims ${m._claimed.video} videos, the tables give ${videos}`);
    }
  }
  delete m._goal; delete m._claimed;
  if (!m.name) warnings.push(`Module ${m.number}: no name`);
  for (const l of m.lessons) {
    if (!l.items.length) warnings.push(`Module ${m.number} ${l.name}: no items`);
    for (const i of l.items) {
      if ((i.name || '').trim().length < MIN_ITEM_NAME) {
        warnings.push(`${i.ref}: item name "${i.name}" is ${(i.name || '').trim().length} characters `
          + `— Coursera requires ${MIN_ITEM_NAME} and drops shorter rows`);
      }
    }
  }
}

// Part 1's own totals against the tables.
{
  const items = course.modules.flatMap(m => m.lessons.flatMap(l => l.items));
  const videos = items.filter(i => i.type === 'Video').length;
  const lessons = course.modules.reduce((a, m) => a + m.lessons.length, 0);
  if (stats['number of videos'] && stats['number of videos'] !== videos) {
    warnings.push(`Part 1 claims ${stats['number of videos']} videos, the tables give ${videos}`);
  }
  if (stats['number of modules'] && stats['number of modules'] !== course.modules.length) {
    warnings.push(`Part 1 claims ${stats['number of modules']} modules, the tables give ${course.modules.length}`);
  }
  // Part 1 counts only content lessons; the assessment, roleplay and project lessons are ours.
  const authored = lessons - course.modules.reduce((a, m) =>
    a + m.lessons.filter(l => /Hands-on Lab and Graded Assessment|Roleplay Activity|Course Final Project/.test(l.name)).length, 0);
  if (stats['number of lessons'] && stats['number of lessons'] !== authored) {
    warnings.push(`Part 1 claims ${stats['number of lessons']} lessons, the tables give ${authored} `
      + '(excluding the assessment, roleplay and project lessons this parser adds)');
  }
}

writeJson(course, warnings);

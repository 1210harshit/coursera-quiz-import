// Shared resolution for Designing Human-AI Collaboration (Course 2): turns what a source document
// SAYS into what the outline KNOWS. Used by all three parsers so the four graded quizzes, the
// fifteen practice quizzes and the final exam resolve identically.
//
// Two resolutions happen here.
//
// MODULE AND LESSON. The twenty files name their module six different ways ("Module: <title>",
// "Module Name: 1 - <title>", "Module name: Module 1 - <title>", "Mapped to: Course: …, Module:
// 3 – <title>", and two files that give no module line at all). The filename states it plainly
// in eighteen of the twenty. So both are read, resolved against the outline, and required to
// agree — a disagreement is reported, never averaged.
//
// ASSETS. Each question cites its source material by title on an "Asset:" line. Those titles
// are matched against the outline's asset index to recover the module, the lesson and the kind
// of item, which is what lets the built feedback say "Module 1 Lesson 1 Video: <title>" in the
// spelled-out form this course owner asked for. A title the outline does not have is reported
// with the question that cites it; nothing is guessed.
const fs = require('fs');
const path = require('path');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'agentic-teams-c2';
const DOCS = path.join(SP, SLUG, 'docs');

// ---------- reference style ----------
// Two forms of the same reference:
//
//   bracketed   Feedback: <explanation> (Refer to Module 1 Lesson 3 Video: <title>)
//
//   own-line    Feedback: <explanation>
//               Refer to Module 1 Lesson 3 Video: <title>
//
// The own-line form is a SEPARATE, ZERO-SPACED PARAGRAPH sitting directly below the feedback —
// not a <w:br/> inside it. That distinction is not cosmetic and was not guessed: an upload of
// managing-break-probe.js (PR #1, 2026-09-28) tried ten encodings in one document. Every
// <w:br/> variant imported but came back rendered as several blank rows with stray spaces;
// only a separate paragraph gave one clean break with the question still importing. A blank
// paragraph between the two, however, still ends the feedback and rejects the question, so
// "directly below" is part of the rule, and the verifier checks it.
//
// This lives here, not in the builder, because the verifier re-derives the expected feedback
// line independently and the two must agree on which document gets which form. One definition,
// both readers.
//
// THE VIDEO IS NOT NUMBERED — "Video:", not "Video 1:" — at the course owner's instruction of
// 2026-09-28, which is the standing format from this course onward:
//
//     Refer to Module 1 Lesson 2 Video: Runaway Loops and Silent Failures
//
// `managing` on GitHub numbers its videos, and this course briefly did too; the title is what
// identifies the item, so the ordinal was dropped. The V number is still derived and still
// stored as each asset's `code` — it is what orders videos within a lesson and what the
// mapping checks run against — it simply does not reach the learner.
//
// EVERY document in this course uses the standing format. The bracketed layout is kept only so
// a document could be built in the older form if one were ever asked for; nothing here uses it.
const STANDING_FORMAT_BY_DEFAULT = true;
const STANDING_FORMAT_DOCS = new Set();

// key: "graded:M2", "practice:M1L3", "final:M5"
const styleKey = (kind, num, lesson) =>
  `${kind}:M${num}` + (kind === 'practice' ? `L${lesson}` : '');

function referenceStyle(kind, num, lesson) {
  const listed = STANDING_FORMAT_DOCS.has(styleKey(kind, num, lesson));
  const standing = STANDING_FORMAT_BY_DEFAULT ? !listed : listed;
  return standing
    ? { layout: 'own-line', numberVideos: false }
    : { layout: 'bracketed', numberVideos: false };
}

// The reference itself, with no surrounding punctuation or spacing: the text of the own-line
// paragraph, and the body of the bracketed form. '' when the question resolved no reference.
function referText(refs, numberVideos) {
  if (!refs || !refs.length) return '';
  return 'Refer to ' + refs.map(r => refString(r, numberVideos)).join('; ');
}

// What follows the explanation ON THE SAME LINE. Empty for the own-line layout, whose reference
// is a paragraph of its own — the builder emits that separately and the verifier folds it back.
function referSuffix(refs, style) {
  const body = referText(refs, style.numberVideos);
  if (!body || style.layout === 'own-line') return '';
  return ` (${body})`;
}

function loadOutline() {
  const p = path.join(SP, SLUG, 'outline.json');
  if (!fs.existsSync(p)) {
    throw new Error(`${p} is missing. Run agentic-teams-c2-parse-outline.js first:\n`
      + `    node src/agentic-teams-c2-parse-outline.js > work/${SLUG}/outline.json`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Matching-only normalisation. Must stay identical to the outline parser's, or titles that
// differ by nothing but a curly apostrophe will fail to resolve.
const norm = s => String(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  // QUOTE MARKS ARE DROPPED FOR MATCHING, not merely straightened. This course's quizzes quote
  // a word the syllabus leaves bare — 'the word "Agent"' against 'the word Agent' — which is a
  // one-token difference that drags word-set overlap to 0.82, just under the near-miss
  // threshold, so the citation resolves to nothing at all. Dropping them is safe: no two assets
  // in these syllabi differ by quoting alone.
  .replace(/["']/g, '')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// This course names its files by CODE rather than in prose, and inconsistently at that:
//
//   "Graded Quiz - Module 1"                 module, no lesson
//   "Final Exam - M5L1"                      M<x>L<y>
//   "Practice Quiz - M1L3"                   M<x>L<y>
//   "Practice quiz-M1L2"                     no space, lower-case "quiz"
//   "Practice Quiz -M3L1"                    space before the dash, not after
//   "Practice Quiz - M2L1 - six-blocks"      a trailing topic slug
//   "EN15_Practice quiz"                     NOTHING but a production code
//
// The last shape is why the document header is still consulted: two of the fifteen practice
// quizzes state their lesson nowhere in the filename, so those resolve from the
// "Module Name:" / "Lesson Name:" lines instead, and the two sources are cross-checked
// whenever both speak. Absent parts stay null.
function readFileName(base) {
  // This course names every file by code alone, with three separators in play:
  //   "M1-Graded Quiz"                     module only, hyphen
  //   "M1L1-Practice Quiz"                 M<x>L<y> run together
  //   "M5_L1_Final_Exam_with_Answer_Key"   underscore between the two halves
  // So the code pattern tolerates nothing, an underscore, a space or a hyphen between M and L,
  // and a bare "M<n>" is read as a module when no lesson follows it.
  // NOTE the (?!\d) rather than \b after the lesson number: "M5_L1_Final_Exam" continues with
  // an underscore, which is a word character, so \b never matches there and the whole code goes
  // unread. That same underscore is why the kind patterns accept it as a separator.
  const code = /\bM(\d+)[\s_-]*L(\d+)(?!\d)/i.exec(base);
  const mod = /\bModule\s*[-\s]?\s*(\d+)\b/i.exec(base) || /\bM(\d+)(?![\s_-]*L\d)/i.exec(base);
  const les = /\bLesson\s*[-\s]?\s*(\d+)(?!\d)/i.exec(base);
  // This course abbreviates: "M1-GQ", "M1L1-PQ", alongside the spelled-out "M2-Graded Quiz".
  // The abbreviations are anchored on a word boundary so a title containing "pq" or "gq" in
  // running text cannot be mistaken for one.
  const kind = /final[\s_-]*exam/i.test(base) ? 'final'
    : /(graded[\s_-]*quiz|(^|[\s_-])GQ($|[\s_.-]))/i.test(base) ? 'graded'
    : /(practice[\s_-]*quiz|(^|[\s_-])PQ($|[\s_.-]))/i.test(base) ? 'practice' : null;
  return {
    module: code ? Number(code[1]) : (mod ? Number(mod[1]) : null),
    lesson: code ? Number(code[2]) : (les ? Number(les[1]) : null),
    kind,
  };
}

// Resolve a module by number when the source gives one, by title otherwise.
function resolveModule(meta, ref, fileRef, issues, label) {
  const byTitle = t => {
    const n = norm(t);
    const hit = Object.values(meta).find(M => norm(M.title) === n);
    return hit ? hit.num : null;
  };
  const stated = ref && ref.num ? ref.num : (ref && ref.title ? byTitle(ref.title) : null);
  const fromName = fileRef.module;

  if (stated && fromName && stated !== fromName) {
    issues.push(`the document says Module ${stated} but the filename says Module ${fromName}; `
      + 'the filename is used, because it is what the course owner files the deliverable under');
    return fromName;
  }
  const num = fromName || stated;
  if (!num) { issues.push('neither the document nor the filename identifies a module'); return null; }
  if (!meta['M' + num]) { issues.push(`Module ${num} is not in the outline`); return null; }

  // When the document names a module TITLE as well, it has to be that module's title.
  if (ref && ref.title && norm(ref.title) !== norm(meta['M' + num].title)) {
    issues.push(`the document calls Module ${num} "${ref.title}" but the outline calls it `
      + `"${meta['M' + num].title}"`);
  }
  return num;
}

function resolveLesson(meta, modNum, ref, fileRef, issues) {
  const M = meta['M' + modNum];
  if (!M) return null;
  const byTitle = t => {
    const n = norm(t);
    const hit = Object.entries(M.lessons).find(([, L]) => norm(L.title) === n);
    return hit ? Number(hit[0]) : null;
  };
  const stated = ref && ref.num ? ref.num : (ref && ref.title ? byTitle(ref.title) : null);
  const fromName = fileRef.lesson;

  if (stated && fromName && stated !== fromName) {
    issues.push(`the document says Lesson ${stated} but the filename says Lesson ${fromName}; `
      + 'the filename is used');
    return fromName;
  }
  const num = fromName || stated;
  if (!num) { issues.push('neither the document nor the filename identifies a lesson'); return null; }
  if (!M.lessons[num]) { issues.push(`Module ${modNum} has no Lesson ${num} in the outline`); return null; }
  if (ref && ref.title && norm(ref.title) !== norm(M.lessons[num].title)) {
    issues.push(`the document calls Lesson ${num} "${ref.title}" but the outline calls it `
      + `"${M.lessons[num].title}"`);
  }
  return num;
}

// Abbreviations the quizzes use for kinds the outline spells out. These are the same item
// under two names, not a mismatch, so they are declared rather than reported.
const KIND_SYNONYM = {
  dpq: 'discussion prompt',
  demo: 'demo video',
  'demo video': 'demo video',
  'discussion prompt question': 'discussion prompt',
  // This syllabus writes the plural and the quizzes echo it; same item, same kind.
  'expert viewpoints': 'expert viewpoint',
};

// A prefix match is only interesting when the outline title is genuinely LONGER — an exact
// match was already tried, and equal length would mean the two differ only in punctuation.
const t_longer = (a, n) => norm(a.title).length > n.length;
const sameKind = (a, b) => {
  const x = KIND_SYNONYM[norm(a)] || norm(a);
  const y = KIND_SYNONYM[norm(b)] || norm(b);
  return x === y;
};

// Word-set overlap, used ONLY to find a near miss worth reporting — never to pick between two
// plausible assets. The outline drops a word from one FAQ title ("the Workflow to a Halt" for
// "the Workflow Grinds to a Halt"), and without this the question that cites it would silently
// lose its reference.
function similarity(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / (A.size + B.size - hit);
}

// One cited asset -> the reference string the builder writes, e.g.
//   "Module 1 Lesson 1 Video: Choosing a Coordination Pattern"
//   "Module 1 Lesson 1 Reading: A Coordination Patterns Reference for Multi-Agent Workflows"
// On an exact match the two documents agree and the title is simply the title. On a near miss
// the OUTLINE supplies the placement and the QUIZ supplies the wording — the quiz sentence is
// the one a human wrote to be read, and the difference is reported so the syllabus can be
// corrected at the source.
function resolveAsset(outline, cited, issues, where, ctx) {
  const rec = outline.assets[norm(cited.title)];
  if (rec) return finish(rec, cited, issues, where, null);

  // "Lab 1" … "Lab 4" — this course's quizzes cite labs by their LESSON ORDINAL rather than by
  // title, which no amount of title matching can resolve. Every module here has at most one lab
  // per lesson, so "Lab N" is the lab in Lesson N of the question's own module. That needs the
  // module, which is why resolution takes a context; without one the citation is reported
  // rather than guessed at.
  const byNumber = /^(Lab|Video|Reading)\s+(\d+)$/i.exec(String(cited.title).trim());
  if (byNumber) {
    const kind = byNumber[1];
    const lesson = Number(byNumber[2]);
    if (!ctx || !ctx.module) {
      issues.push(`${where}: cites "${cited.title}" by number, but the document's module is not `
        + 'known, so it cannot be resolved');
      return null;
    }
    const hit = Object.values(outline.assets).find(a =>
      a.module === ctx.module && a.lesson === lesson && norm(a.kind) === norm(kind));
    if (hit) {
      issues.push(`${where}: cites "${cited.title}" by number; resolved to the ${kind} in `
        + `Module ${ctx.module} Lesson ${lesson}, "${hit.title}". Confirm that is the intended one.`);
      return finish(hit, { ...cited, kind: null }, issues, where, null);
    }
    issues.push(`${where}: cites "${cited.title}", but Module ${ctx.module} Lesson ${lesson} has `
      + `no ${kind} in the outline`);
    return null;
  }

  // Two final-exam citations name a THEME and an item together, separated by a slash:
  //   "Module 3 Case Study themes / Reading: A Checklist of Dropped-Baton Anti-Patterns to Avoid"
  //   "Module 5 Cumulative Project Overview / Final Project instructions"
  // Only one side of each names something the outline holds, so each part is re-parsed as a
  // citation in its own right — kind prefix, module prefix and all — and the first that
  // resolves is used.
  const parts = String(cited.title).split(/\s*\/\s*/);
  if (parts.length > 1) {
    for (const part of parts) {
      const [p] = require('./lib-quizdoc-ibm').splitAssets(part);
      if (!p) continue;
      const alt = outline.assets[norm(p.title)];
      if (alt) {
        return finish(alt, { ...p, statedModule: p.statedModule || cited.statedModule },
          issues, where, null);
      }
    }
  }

  // A citation that is a PREFIX of exactly one outline title. This course truncates two of
  // them — "One-Page Business Case Format" for "… Used by IBM Consulting Teams", "Funded vs.
  // Rejected" for "…: Two Business Cases Side by Side". Word-set overlap scores those at 0.56
  // and 0.33, far below the near-miss threshold, because the outline title is simply longer.
  // A prefix that matches one asset and one only is unambiguous; a prefix matching several is
  // reported rather than picked.
  {
    const n = norm(cited.title);
    // The boundary matters: "Funded vs. Rejected" continues as "Funded vs. Rejected: Two
    // Business Cases…", so the character after the prefix is a colon, not a space. Requiring a
    // space alone would miss it, while requiring nothing would let "Process Map" match
    // "Process Mapping".
    const boundary = a => {
      const t = norm(a.title);
      return t.startsWith(n) && (t.length === n.length || /[\s:,\-–—]/.test(t[n.length]));
    };
    const pre = Object.values(outline.assets).filter(a =>
      (!cited.kind || sameKind(cited.kind, a.kind)) && t_longer(a, n) && boundary(a));
    if (pre.length === 1) {
      issues.push(`${where}: the quiz cites "${cited.title}", which is the opening of the outline's `
        + `"${pre[0].title}". The outline's full title is used.`);
      return finish(pre[0], cited, issues, where, null);
    }
    if (pre.length > 1) {
      issues.push(`${where}: "${cited.title}" opens ${pre.length} outline titles `
        + `(${pre.slice(0, 3).map(a => `"${a.title}"`).join(', ')}) and cannot be resolved`);
      return null;
    }
  }

  const near = Object.values(outline.assets)
    .filter(a => !cited.kind || sameKind(cited.kind, a.kind))
    .map(a => ({ a, s: similarity(cited.title, a.title) }))
    .filter(x => x.s >= 0.85)
    .sort((x, y) => y.s - x.s);
  if (near.length === 1 || (near.length > 1 && near[0].s > near[1].s)) {
    issues.push(`${where}: the quiz cites "${cited.title}" but the outline titles the same `
      + `${near[0].a.kind} "${near[0].a.title}". The quiz wording is used in the reference and the `
      + 'outline supplies the module and lesson — correct the syllabus so the two agree.');
    return finish(near[0].a, cited, issues, where, cited.title);
  }
  if (near.length > 1) {
    issues.push(`${where}: "${cited.title}" is close to ${near.length} outline assets `
      + `(${near.slice(0, 3).map(x => `"${x.a.title}"`).join(', ')}) and cannot be resolved`);
    return null;
  }

  issues.push(`${where}: the outline has no asset titled "${cited.title}"`
    + (cited.kind ? ` (cited as ${cited.kind})` : ''));
  return null;
}

function finish(rec, cited, issues, where, overrideTitle) {
  if (cited.kind && !sameKind(cited.kind, rec.kind)) {
    issues.push(`${where}: the quiz cites "${rec.title}" as a ${cited.kind} but the outline lists `
      + `it as a ${rec.kind}; the outline's kind is used`);
  }
  if (cited.statedModule && cited.statedModule !== rec.module) {
    issues.push(`${where}: the quiz places "${rec.title}" in Module ${cited.statedModule} but the `
      + `outline has it in Module ${rec.module}`);
  }
  // The displayed title carries the outline's prefix for kinds that are not Coursera item
  // types — "FAQ: " in front of a Reading. `title` stays bare, because that is the key every
  // later check matches on. The prefix applies to a near-matched title too, since the kind is
  // the outline's either way.
  const title = overrideTitle || rec.title;
  const shown = (rec.titlePrefix || '') + title;
  // The PARTS are stored, not just the finished string, because two documents in this course
  // spell the same reference differently — one numbers its videos, the rest do not — and that
  // is a per-document build decision, not a property of the asset. refString() assembles them.
  // `ref` is kept as the unnumbered form, which is what every check that does not care about
  // numbering compares against.
  const videoNo = rec.kind === 'Video' && /V(\d+)$/.test(rec.code || '')
    ? Number(/V(\d+)$/.exec(rec.code)[1]) : null;
  const out = {
    code: rec.code, kind: rec.kind, label: rec.label,
    module: rec.module, lesson: rec.lesson, title, shown, videoNo,
  };
  out.ref = refString(out, false);
  return out;
}

// One reference, assembled from its parts.
//
//   numberVideos false -> "Module 1 Lesson 3 Video: From One Agent to Two"
//   numberVideos true  -> "Module 1 Lesson 3 Video 1: From One Agent to Two"
//
// Only videos take a number, and only when the document asks for it; a Reading, Lab or
// Discussion Prompt has none to take. The number is the video's position in its lesson, from
// the M<x>L<y>V<z> code the outline parser derives.
function refString(r, numberVideos) {
  const label = (numberVideos && r.videoNo) ? `${r.label} ${r.videoNo}` : r.label;
  return `Module ${r.module} Lesson ${r.lesson} ${label}: ${r.shown}`;
}

// Every question in one document: resolve its cited assets into reference strings.
function resolveQuestionRefs(outline, doc, issues, docLabel, ctx) {
  for (const q of doc.questions) {
    q.refs = [];
    for (const cited of q.assets) {
      const r = resolveAsset(outline, cited, issues, `${docLabel} Q${q.num}`, ctx);
      if (r) q.refs.push(r);
    }

    // THIS COURSE STATES ITS MAPPING IN THE HEADER for the files that have no "Asset:" line:
    //
    //     Q1 (M1L3V1)                 the video, by code
    //     Question 4 - Reading M2L1   the reading in that lesson, by kind
    //
    // Both are mappings the other courses put on an Asset line, so they resolve to the same
    // kind of reference. They are used only when the question cited nothing, so an Asset line
    // always wins where one exists.
    // A header stating a LIST of mappings — "M1L1V1 + M1L3 Reading". Two graded quizzes carry
    // no Asset line at all and state every question's sources this way.
    if (!q.refs.length && q.headerMaps && q.headerMaps.length) {
      for (const m of q.headerMaps) {
        let rec = null;
        if (m.code) rec = Object.values(outline.assets).find(a => a.code === m.code);
        else {
          const ml = /^M(\d+)L(\d+)$/i.exec(m.lesson || '');
          if (ml) rec = Object.values(outline.assets).find(a =>
            a.module === Number(ml[1]) && a.lesson === Number(ml[2])
            && norm(a.kind) === norm(m.kind));
        }
        if (rec) q.refs.push(finish(rec, { kind: null, title: rec.title }, issues,
          `${docLabel} Q${q.num}`, null));
        else issues.push(`${docLabel} Q${q.num}: its header names `
          + `"${m.code || (m.kind + ' ' + m.lesson)}", which matches nothing in the outline`);
      }
      if (q.refs.length) {
        issues.push(`${docLabel} Q${q.num}: mapped from the question header rather than an `
          + `"Asset:" line (${q.headerMaps.map(m => m.code || (m.kind + ' ' + m.lesson)).join(' + ')})`);
      }
    }

    if (!q.refs.length && q.headerCode) {
      const v = outline.map[q.headerCode];
      if (v) {
        const rec = Object.values(outline.assets).find(a => a.code === q.headerCode);
        if (rec) q.refs.push(finish(rec, { kind: null, title: rec.title }, issues,
          `${docLabel} Q${q.num}`, null));
      } else {
        issues.push(`${docLabel} Q${q.num}: its header maps to ${q.headerCode}, which the outline `
          + 'has no video for');
      }
    }
    if (!q.refs.length && q.headerKind) {
      const m = /^M(\d+)L(\d+)$/i.exec(q.headerKind.lesson);
      const hit = m && Object.values(outline.assets).find(a =>
        a.module === Number(m[1]) && a.lesson === Number(m[2])
        && norm(a.kind) === norm(q.headerKind.kind));
      if (hit) {
        issues.push(`${docLabel} Q${q.num}: its header names "${q.headerKind.kind} `
          + `${q.headerKind.lesson}" rather than a title; resolved to "${hit.title}". Confirm `
          + 'that is the intended one.');
        q.refs.push(finish(hit, { kind: null, title: hit.title }, issues,
          `${docLabel} Q${q.num}`, null));
      } else {
        issues.push(`${docLabel} Q${q.num}: its header names "${q.headerKind.kind} `
          + `${q.headerKind.lesson}", which matches no asset in the outline`);
      }
    }

    if (!q.refs.length && (q.assets.length || q.headerCode || q.headerKind || (q.headerMaps && q.headerMaps.length))) {
      issues.push(`${docLabel} Q${q.num}: nothing it names resolved, so its feedback will carry `
        + 'no reference');
    }
  }
}

// Every extracted source document, in filename order.
function listDocs() {
  if (!fs.existsSync(DOCS)) {
    throw new Error(`${DOCS} is missing. Extract the seventeen source .docx files into it, one `
      + 'directory each, named after the file.');
  }
  return fs.readdirSync(DOCS)
    .filter(d => fs.existsSync(path.join(DOCS, d, 'word', 'document.xml')))
    .sort()
    .map(d => ({ base: d, dir: path.join(DOCS, d), file: readFileName(d) }));
}

module.exports = {
  SP, SLUG, DOCS, loadOutline, listDocs, readFileName, norm,
  resolveModule, resolveLesson, resolveAsset, resolveQuestionRefs,
  referenceStyle, referSuffix, referText, refString,
};

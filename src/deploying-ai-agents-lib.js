// Shared resolution for Deploying and Orchestrating AI Agents: turns what a source document
// SAYS into what the outline KNOWS. Used by all three parsers so the four graded quizzes, the
// twelve practice quizzes and the final exam resolve identically.
//
// Two resolutions happen here.
//
// MODULE AND LESSON. The seventeen files name their module six different ways ("Module: <title>",
// "Module Name: 1 - <title>", "Module name: Module 1 - <title>", "Mapped to: Course: …, Module:
// 3 – <title>", and two files that give no module line at all). The filename states it plainly
// in fifteen of the seventeen. So both are read, resolved against the outline, and required to
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
const SLUG = 'deploying-ai-agents';
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
// The course owner asked to see this on ONE document first — the Module 1 Lesson 3 practice
// quiz — before it goes across the set, so that is the only exception and everything else
// keeps the bracketed form it shipped with.
//
// This lives here, not in the builder, because the verifier re-derives the expected feedback
// line independently and the two must agree on which document gets which form. One definition,
// both readers.
//
// The own-line layout also NUMBERS ITS VIDEOS — "Video 1", not "Video" — because it is the
// format the course owner settled on GitHub for `managing`, and the two must match. The
// bracketed layout keeps the unnumbered label this course was delivered with. So the style is
// two decisions travelling together, not one.
//
// To adopt the GitHub format everywhere, set GITHUB_FORMAT_BY_DEFAULT to true —
// GITHUB_FORMAT_DOCS then reads as the list of documents that keep the old form, and should
// be emptied.
const GITHUB_FORMAT_BY_DEFAULT = false;
const GITHUB_FORMAT_DOCS = new Set(['practice:M1L3']);

// key: "graded:M2", "practice:M1L3", "final:M5"
const styleKey = (kind, num, lesson) =>
  `${kind}:M${num}` + (kind === 'practice' ? `L${lesson}` : '');

function referenceStyle(kind, num, lesson) {
  const listed = GITHUB_FORMAT_DOCS.has(styleKey(kind, num, lesson));
  const github = GITHUB_FORMAT_BY_DEFAULT ? !listed : listed;
  return github
    ? { layout: 'own-line', numberVideos: true }
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
    throw new Error(`${p} is missing. Run deploying-ai-agents-parse-outline.js first:\n`
      + `    node src/deploying-ai-agents-parse-outline.js > work/${SLUG}/outline.json`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Matching-only normalisation. Must stay identical to the outline parser's, or titles that
// differ by nothing but a curly apostrophe will fail to resolve.
const norm = s => String(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// "Coordination Patterns…, Module 1, Lesson 1, Practice Quiz" and the prefixed variants
// ("EN084_…", "VO_EN115_…_V1"). Returns whatever the name states; absent parts stay null.
function readFileName(base) {
  const m = /,\s*Module\s+(\d+)\b/i.exec(base);
  const l = /,\s*Lesson\s+(\d+)\b/i.exec(base);
  const kind = /final\s*exam/i.test(base) ? 'final'
    : /graded\s*quiz/i.test(base) ? 'graded'
    : /practice\s*quiz/i.test(base) ? 'practice' : null;
  return { module: m ? Number(m[1]) : null, lesson: l ? Number(l[1]) : null, kind };
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
};
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
function resolveAsset(outline, cited, issues, where) {
  const rec = outline.assets[norm(cited.title)];
  if (rec) return finish(rec, cited, issues, where, null);

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
function resolveQuestionRefs(outline, doc, issues, docLabel) {
  for (const q of doc.questions) {
    q.refs = [];
    for (const cited of q.assets) {
      const r = resolveAsset(outline, cited, issues, `${docLabel} Q${q.num}`);
      if (r) q.refs.push(r);
    }
    if (!q.refs.length && q.assets.length) {
      issues.push(`${docLabel} Q${q.num}: none of its cited assets resolved, so its feedback will `
        + 'carry no reference');
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

// Shared resolution for Threat Response, Hunting, and Security Operations: turns what a source document
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
const SLUG = 'cyber-course-3';
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
//
// IT WAS BRIEFLY SET TO `false` AND PUT BACK, on the course owner's instruction (2026-11-25).
// Recording that so the reasoning is not repeated: Coursera refused these documents with
// "content could not be processed" on two separate quizzes, and the bracketed form was tried
// because it removes the free-standing `Refer to` paragraph from under every option — forty per
// document, 520 across the course — which was the largest remaining structural difference
// between these files and a bare-minimum import document.
//
// That was the wrong call regardless of whether it would have worked. The reference format is
// the course owner's decision, set on 2026-09-28 and unchanged since; a diagnosis is not a
// reason to change what the learner reads, and a course that silently stops matching its
// siblings is a worse problem than the one being chased. Diagnose with
// `cyber-course-3-import-probe.js`, which asks the same question in one upload and changes no
// delivered document.
//
// What the attempt did establish, and what is worth keeping: the import failure is NOT in the
// question grammar or the package. The .docx is byte-identical to the delivered cyber-course-1
// set in every part except word/document.xml; the Guide Section is identical in structure —
// 13 lines, no tables, 3 hyperlinks; all 182 questions across both courses pass a per-question
// check for four options lettered A-D in order, one starred answer, one feedback block each and
// question numbers 1..n without duplicates; no shape from SETUP §7 is present; and the
// character repertoire matches bar one em dash in an M3L2 prompt.
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
    throw new Error(`${p} is missing. Run cyber-course-3-parse-outline.js first:\n`
      + `    node src/cyber-course-3-parse-outline.js > work/${SLUG}/outline.json`);
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
  // A production code can precede the module with an UNDERSCORE — "EN036_M1_Graded_Quiz",
  // "EN124_M4L1-Practice_Quiz". Underscore is a word character, so \b never matches before
  // that M and both files read as having no module at all. The boundary is therefore spelled
  // out as start-of-string or any non-alphanumeric.
  const code = /(?:^|[^A-Za-z0-9])M(\d+)[\s_-]*L(\d+)(?!\d)/i.exec(base);
  const mod = /(?:^|[^A-Za-z0-9])Module\s*[-\s]?\s*(\d+)/i.exec(base)
    || /(?:^|[^A-Za-z0-9])M(\d+)(?![\s_-]*L\d)/i.exec(base);
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

  // A BARE MAPPING CODE -- "M3L2V1" -- and a LESSON-PLUS-KIND -- "M3L3 FAQ". Module 3's
  // graded quiz lists its sources as a mix of both, joined by "+", on a line below the
  // question header. Neither is a title, so neither resolves by title lookup.
  const bareCode = /^(M\d+L\d+V\d+)$/i.exec(String(cited.title).trim());
  if (bareCode) {
    const want = bareCode[1].toUpperCase();
    const hit = Object.values(outline.assets).find(a => a.code && a.code.toUpperCase() === want);
    if (hit) return finish(hit, Object.assign({}, cited, { title: hit.title }), issues, where, null);
    issues.push(`${where}: cites ${want}, which the syllabus has no asset for`);
    return null;
  }
  const lessonKind = /^M(\d+)L(\d+)\s+(.+)$/i.exec(String(cited.title).trim());
  if (lessonKind) {
    const mod = Number(lessonKind[1]);
    const les = Number(lessonKind[2]);
    const kind = lessonKind[3].trim();
    const inLesson = Object.values(outline.assets).filter(a => a.module === mod && a.lesson === les);
    const byKind = inLesson.filter(a => sameKind(kind, a.kind));
    if (byKind.length === 1) {
      return finish(byKind[0], Object.assign({}, cited, { title: byKind[0].title, kind: null }),
        issues, where, null);
    }
    if (byKind.length > 1) {
      issues.push(`${where}: cites "${cited.title}", and Module ${mod} Lesson ${les} has `
        + `${byKind.length} assets of that kind, so it cannot be resolved`);
      return null;
    }
  }

  // "Lesson 1 - Core Zero Trust Tenets" -- a citation naming a whole LESSON rather than one
  // asset, with a paraphrased title the syllabus does not carry ("The Core Tenets of Zero
  // Trust"). The Module 2 Lesson 3 practice quiz cites all five of its sources this way. The
  // NUMBER is exact and the question's module is known, so the lesson resolves from the outline
  // and the outline's own title is what gets shown; the paraphrase is reported, not used.
  const lessonRef = /^Lesson\s+(\d+)\s*[:–—-]\s*(.*)$/i.exec(String(cited.title).trim());
  if (lessonRef) {
    const n = Number(lessonRef[1]);
    if (!ctx || !ctx.module) {
      issues.push(`${where}: cites "${cited.title}", a lesson, but the document's module is not `
        + 'known, so it cannot be resolved');
      return null;
    }
    const mod = outline.meta['M' + ctx.module];
    const les = mod && mod.lessons && mod.lessons[n];
    if (les) {
      const said = String(lessonRef[2] || '').trim();
      if (said && norm(said) !== norm(les.title)) {
        issues.push(`${where}: cites Lesson ${n} as "${said}" but the syllabus calls it `
          + `"${les.title}". The syllabus title is used.`);
      }
      return {
        module: ctx.module, lesson: n, kind: 'Lesson', label: 'Lesson',
        title: les.title, shown: les.title, code: null, lessonLevel: true,
      };
    }
    issues.push(`${where}: cites Lesson ${n}, which Module ${ctx.module} does not have`);
    return null;
  }

  // "Video 1: Never Trust, Always Verify" -- the citation puts the asset's KIND and its ordinal
  // in front of the title, where the syllabus lists the title alone. Eight of this course's
  // practice quizzes cite every source that way, and the title behind the prefix is an exact
  // match, so the prefix is stripped and the lookup retried before anything is reported. The
  // "Lesson 1, Video 1: Planning a Hypothesis-Driven Hunt" -- A LESSON PREFIX IN FRONT OF THE
  // KIND PREFIX. Both graded quizzes for Modules 2 and 3 cite every source this way, twenty
  // questions in all, and not one of them resolved: the title lookup saw the whole string, and
  // the kind-prefix strip below only handles a citation that STARTS with the kind.
  //
  // The lesson number is real information, so it is used rather than discarded. The module
  // comes from the question's own document, the remainder is re-parsed as an ordinary citation,
  // and the asset the title finds is required to sit in the lesson the quiz named — a
  // disagreement is reported, never averaged, because one of the two documents is then wrong
  // about where the material lives.
  // THE FINAL EXAM PUTS THE MODULE IN FRONT OF THE LESSON — "Module 1, Lesson 2, Video 3:
  // Building the Incident Picture" — because it draws on all three modules and cannot rely on
  // its own placement to say which. The module is therefore taken from the citation when it
  // states one and from the question's own document otherwise, which is what lets one resolver
  // serve both the graded quizzes and the exam.
  const lessonPrefixed =
    /^(?:Module\s+(\d+)\s*,\s*)?Lesson\s+(\d+)\s*,\s*(\S.*)$/i.exec(String(cited.title).trim());
  if (lessonPrefixed) {
    const saidModule = lessonPrefixed[1] ? Number(lessonPrefixed[1]) : null;
    const saidLesson = Number(lessonPrefixed[2]);
    const rest = lessonPrefixed[3].trim();
    const bare = /^(?:Demo Video|Video|Reading|Lab|FAQ|Discussion Prompt|Case Study|Expert Viewpoints?|Downloadable Resource|SME Interview)\s*\d*\s*[:–—-]\s*(\S.*)$/i
      .exec(rest);
    const title = bare ? bare[1] : rest;
    const hit = outline.assets[norm(title)];
    if (hit) {
      if (hit.lesson !== saidLesson) {
        issues.push(`${where}: cites "${cited.title}", but the syllabus has "${hit.title}" in `
          + `Lesson ${hit.lesson} of Module ${hit.module}, not Lesson ${saidLesson}. The `
          + 'syllabus placement is used — correct whichever document is wrong.');
      }
      if (saidModule && hit.module !== saidModule) {
        issues.push(`${where}: cites "${cited.title}", but the syllabus has "${hit.title}" in `
          + `Module ${hit.module}, not Module ${saidModule}. The syllabus placement is used.`);
      } else if (!saidModule && ctx && ctx.module && hit.module !== ctx.module) {
        issues.push(`${where}: cites "${cited.title}" as if it were in this module, but the `
          + `syllabus has it in Module ${hit.module}. The syllabus placement is used.`);
      }
      return finish(hit, Object.assign({}, cited, { title, kind: null }), issues, where, null);
    }

    // THE TITLE DOES NOT MATCH, BUT THE POSITION DOES. Three of Module 2's citations name an
    // item the syllabus titles differently:
    //
    //   quiz: Lesson 1, Video 1: Planning a Hypothesis-Driven Hunt
    //   syll: Video: Forming a Hunting Hypothesis
    //   quiz: Lesson 1, FAQ: When a Hunt Hypothesis Cannot Be Tested With Available Telemetry
    //   syll: FAQ: When a Hunting Hypothesis Cannot Be Tested With Available Data
    //
    // Word-set overlap puts the FAQ pair at 0.67, below the near-miss threshold, and the two
    // video titles share almost nothing — so title matching cannot reach any of them. What the
    // citation DOES state precisely is the position: the module from its own document, the
    // lesson, and for a video its ordinal within that lesson. That is the same reasoning the
    // bare-code branch above applies to "M2L1V1", and it is resolved the same way.
    //
    // Only an UNAMBIGUOUS position is accepted — the video at that exact ordinal, or the one
    // and only asset of that kind in that lesson. The wording difference is always reported,
    // because one of the two documents needs correcting and neither can be chosen from here.
    const mod = saidModule || (ctx && ctx.module);
    const kindWord = bare ? /^([A-Za-z][A-Za-z ]*?)\s*\d*\s*[:–—-]/.exec(rest) : null;
    if (mod && kindWord) {
      const kind = kindWord[1].trim();
      const ord = /\s(\d+)\s*[:–—-]/.exec(rest);
      const inLesson = Object.values(outline.assets)
        .filter(a => a.module === mod && a.lesson === saidLesson && sameKind(kind, a.kind));
      let pick = null;
      if (ord) {
        const want = `M${mod}L${saidLesson}V${Number(ord[1])}`;
        pick = inLesson.find(a => (a.code || '').toUpperCase() === want) || null;
      } else if (inLesson.length === 1) {
        pick = inLesson[0];
      }
      if (pick) {
        issues.push(`${where}: cites "${cited.title}" but the syllabus titles that `
          + `${/^[A-Z]+$/.test(pick.kind) ? pick.kind : pick.kind.toLowerCase()} "${pick.title}". `
          + `Resolved by position — Module ${mod} `
          + `Lesson ${saidLesson}${ord ? ` ${pick.kind} ${Number(ord[1])}` : ''} — and the `
          + 'syllabus title is what the learner is sent to. Reconcile the two documents.');
        return finish(pick, Object.assign({}, cited, { title: pick.title, kind: null }),
          issues, where, null);
      }
    }
  }

  // kind the outline holds still wins; this only finds the asset, it does not relabel it.
  // EXPERT VIEWPOINTS, AND AN EM DASH FOR THE COLON. M4L2 Q5 cites
  //   "Expert Viewpoints — A SOC Engineer on the Tuning Change They Hesitated to Make"
  // for a syllabus item titled "A SOC Engineer on the Tuning Change They Hesitated to Make"
  // and listed as an "Expert Viewpoint". Two things defeated the lookup: the kind was not in
  // this prefix list, and the separator is an em dash where ASSET_KIND in the shared reader
  // splits on a colon, so the kind stayed glued to the title and no title matched. The kinds
  // this course actually uses are listed now — the plural already has a KIND_SYNONYM entry,
  // so the item is relabelled with the syllabus' own singular kind once it resolves.
  const prefixed = /^(?:Demo Video|Video|Reading|Lab|FAQ|Discussion Prompt|Case Study|Expert Viewpoints?|Downloadable Resource|SME Interview)\s*\d*\s*[:–—-]\s*(\S.*)$/i
    .exec(String(cited.title).trim());
  if (prefixed) {
    const hit = outline.assets[norm(prefixed[1])];
    if (hit) return finish(hit, Object.assign({}, cited, { title: prefixed[1] }), issues, where, null);
  }

  // "M1L2V2: Video: Common Adversary Tactics and Motivations" -- the MAPPING CODE in front of a
  // kind and a title. The code names the asset outright, so it is resolved by code and the rest
  // of the citation is only checked against what the code found. Where the two disagree the
  // code wins and the disagreement is reported, because the code is the precise half.
  const coded = /^(M\d+L\d+V\d+)\s*[:–—-]\s*(.*)$/i.exec(String(cited.title).trim());
  if (coded) {
    const code = coded[1].toUpperCase();
    const hit = Object.values(outline.assets).find(a => a.code && a.code.toUpperCase() === code);
    if (hit) {
      const rest = String(coded[2] || '').replace(
        /^(?:Demo Video|Video|Reading|Lab|FAQ|Discussion Prompt|Case Study|Expert Viewpoints?|Downloadable Resource|SME Interview)\s*\d*\s*[:–—-]\s*/i, '');
      if (rest && norm(rest) !== norm(hit.title)) {
        issues.push(`${where}: cites ${code} with the title "${rest}", but ${code} is `
          + `"${hit.title}". The code is used.`);
      }
      return finish(hit, Object.assign({}, cited, { title: hit.title }), issues, where, null);
    }
  }

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
  // ONE COLON PER REFERENCE — the one that introduces the title after the asset kind. A
  // colon INSIDE the title makes a second, and Coursera refuses the whole document with
  // "Content couldn't be processed", naming nothing. Confirmed on 2026-11-27: GenAIOps
  // Course 3's graded quizzes failed for days while its practice quizzes imported, and the
  // only difference was question 7 citing
  //
  //     Module 2 Lesson 3 Reading: Summary and Highlights: Drift Detection for Data, …
  //
  // Replacing that colon with an en dash fixed it. Titles with a natural colon are common —
  // "Bloom's Taxonomy: Theory", "Build, Buy, or Partner: Making the Right Growth Decision" —
  // so this is applied in every course rather than left to be rediscovered. No words are
  // added or removed; only the punctuation changes, and the title reads as the author wrote
  // it. `check-reference-colons.js` fails the build if one ever gets through.
  const shown = ((rec.titlePrefix || '') + title).replace(/\s*:\s*/g, ' – ');
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
  // A LESSON-LEVEL reference names no asset kind: "Module 2 Lesson 1: The Core Tenets of Zero
  // Trust". Writing "Lesson Lesson:" would be the alternative, and a learner sent to a lesson
  // rather than to one video reads this correctly.
  if (r.lessonLevel) return `Module ${r.module} Lesson ${r.lesson}: ${r.shown}`;
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

// ---------- source-shape normalisation ----------
// FIVE AUTHORING TEMPLATES IN ONE COURSE. Six of the sixteen quiz documents are written in the
// import grammar the shared reader expects; the other ten are not, each in its own way. Rather
// than widen the shared reader for shapes that exist nowhere else in the repo, every one of
// them is rewritten HERE, into the shape the standard documents already use, before the reader
// sees a line. `readQuizDoc` takes this as its `normalise` hook.
//
// A sweep of all 450 stored source documents was run for each shape below before it was
// handled, and every one of them is unique to this course. That is why none of this is in
// lib-quizdoc-ibm.js: a reader loose enough to accept them would misread documents that are
// already correct. The one exception — a bare "Lesson learning objectives" heading, which five
// documents across three courses share — WAS made in the shared library, where its evidence is
// recorded.
//
// Nothing here invents content. Each rule either relabels a line the author wrote, splits two
// lines the author ran together, or states explicitly what the author left implicit; where a
// rule had to choose, it records a warning through `shapeWarnings` so a human sees it.

const shapeWarnings = [];

// 1. "Source:" FOR "Asset:" — M2L3, M3L1 and M4L2 practice quizzes, fifteen questions.
//    The citation sits one line below the question header, exactly where an Asset line sits,
//    and names the same thing: "Source: Video 1: How the QRadar Offense Pipeline Works".
//    Unrecognised it was read as the first line of the PROMPT, which both lost the reference
//    and put the video title in front of the learner's question.
const SOURCE_LINE = /^Sources?\s*:\s*(\S.*)$/i;
const KIND_SEMICOLON =
  /^(Assets?|Sources?)\s*:\s*(Demo Video|Video|Reading|Lab|FAQ|Discussion Prompt|Case Study|Expert Viewpoints?|Downloadable Resource|SME Interview)\s*;\s*(\S.*)$/i;

// 2. "Correct answer." / "Incorrect answer." FOR "Correct." / "Incorrect." — M2-GQ, 39 of its
//    40 feedback lines. The shared VERDICT pattern requires punctuation directly after the
//    verdict word, deliberately: genaiops-c2 has two explanations that OPEN with the word
//    "Wrong" as ordinary prose ("Wrong passages were retrieved…"), and a looser pattern would
//    swallow their first word and key the option. Only this one document in 450 writes the
//    verdict with "answer" after it, so the word is dropped here instead. The verdict is
//    stripped from delivered feedback either way, so no learner-facing text is lost — and
//    without this, Q10, which is also the one question in the document carrying no star, could
//    not be keyed at all.
const VERDICT_ANSWER = /^(Feedback\s*[:–-]\s*)(Correct|Incorrect|Right|Wrong)\s+answers?\b\s*([.!,:])/i;

// 3. A PROMPT RUN TOGETHER WITH OPTION A — M4-GQ Q5. The paragraph break between the question
//    and its first option was lost, leaving "…What is the strongest response?A: Suppress the
//    maintenance identity…" as one line. The question then had three options and a feedback
//    line with nothing above it. The split point is a sentence end followed immediately — no
//    space — by an option label, which is a shape no correctly written line has.
const GLUED_OPTION = /^(.*[.?!])\s*(\*?\s*[A-F]\s*[:.]\s+\S.*)$/;

// 4. "Explanation:" AND "Why the other options are incorrect:" — M1L1 and M1L2 practice
//    quizzes, eight questions. These write one explanation for the keyed option and then a
//    heading followed by one line per wrong option:
//
//        Correct Answer: B
//        Explanation: SIEM architecture should begin with the protect surface…
//        Why the other options are incorrect:
//        A. collects data before establishing its detection purpose.
//        C. makes capacity rather than detection need the primary design driver.
//
//    The reader understands "Correct Explanation:" and "Incorrect Explanation — A:", so the
//    lines are relabelled into those. Left alone, the three reason lines parsed as OPTIONS —
//    every question reported seven — and the explanations reached no option at all.
//
//    THE REASON TEXT IS CAPITALISED, because the author wrote each line to be read after the
//    letter that precedes it ("A. collects data…") and it becomes a standalone sentence of
//    feedback under its option. Nothing else about the wording is touched, and the count is
//    reported so the source can be rewritten properly.
const EXPL_BARE = /^Explanation\s*[:–-]\s*(\S.*)$/i;
const WHY_HEAD = /^Why\s+the\s+other\s+options?\s+(?:are|is)\s+incorrect\s*[:–-]?\s*$/i;
const WHY_ITEM = /^([A-F])\s*[:.]\s+(\S.*)$/;

// 5. NO ANSWER MARKER AT ALL — M4L1 practice quiz, all five questions. It writes four options,
//    then a "Correct Explanation:" and three "Incorrect Explanation — X:" lines, and never
//    states which option is correct. It does not need to: with four options and three named as
//    incorrect, the ONE letter not named is the answer. That is derived rather than guessed,
//    and only when exactly one letter is left over — anything else is reported and left alone.
const CORRECT_EXPL_LINE = /^Correct\s+Explanation\s*[:–—-]/i;
const INCORRECT_EXPL_LINE = /^Incorrect\s+Explanation\s*[:–—-]*\s*([A-F])\s*[:–—-]/i;
const OPTION_LINE = /^(\*+)?\s*([A-F])\s*[:.]\s+(.+)$/;
const Q_HEAD_LINE = /^(?:Question\s+\d+|Q\d+)\b/i;

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------- the answer marked in ITALICS ----------
// M4L1's practice quiz marks its correct option by setting it in ITALICS. It is a perfectly
// clear marking in Word and it is the only one that document carries — no star, no "Correct
// Answer:" line — but neither lines() nor linesWithBold() reports italics, so the reader saw
// four indistinguishable options and could not key the question at all.
//
// ITALICS ONLY COUNT WHERE THEY DISTINGUISH SOMETHING. Four of this course's sixteen documents
// are set in italics ENTIRELY — M4-GQ 131 of 131 paragraphs, M2L2 78 of 78, M5 Final Exam 134
// of 135, M4L3 96 of 102 — where it is the body font and marks nothing. Reading those as
// answer markings would star every option of every question. So a document's italics are
// consulted only when SOME of its option lines are italic and some are not, and only when
// exactly one option per question is.
//
// THE DERIVATION IS KEPT AS A CROSS-CHECK, not as the answer. M4L1 also names three of its
// four options in "Incorrect Explanation — X:" lines, so the remaining letter is implied, and
// the two agree on all five questions (B, C, D, A, A). Where a document gives both and they
// DISAGREE, that is a real defect in the source and it is reported rather than resolved by
// preferring one — which is why both are still computed.
function italicOptionKey(docxDir) {
  const xml = path.join(docxDir, 'word', 'document.xml');
  if (!fs.existsSync(xml)) return null;
  const src = fs.readFileSync(xml, 'utf8');
  const ITALIC_RPR = /<w:i(?:\s[^>]*)?\/>|<w:i\s+w:val="(?:1|true|on)"/;
  const rows = [];
  for (const p of src.split(/<w:p[\s>]/).slice(1)) {
    let text = '', runs = 0, italic = 0;
    for (const r of p.split(/<w:r[\s>]/).slice(1)) {
      const t = [...r.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
      if (!t.trim()) continue;
      runs++;
      const rPr = /^([\s\S]*?)<\/w:rPr>/.exec(r);
      if (rPr && ITALIC_RPR.test(rPr[1])) italic++;
      text += t;
    }
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/ /g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (text) rows.push({ text, italic: runs > 0 && italic === runs });
  }
  if (!rows.length) return null;

  // Wholly italic: the font, not a marking.
  if (rows.every(r => r.italic)) return null;

  const OPT = /^(\*+)?\s*([A-F])\s*[:.]\s+(.+)$/;
  const QH = /^(?:Question\s+(\d+)|Q(\d+))\b/i;
  const EXPL = /^(?:Correct|Incorrect)\s+Explanation/i;
  const per = new Map();
  let q = null;
  for (const r of rows) {
    const h = QH.exec(r.text);
    if (h) { q = Number(h[1] || h[2]); per.set(q, { n: 0, italic: [] }); continue; }
    if (q == null || EXPL.test(r.text)) continue;
    const o = OPT.exec(r.text);
    if (!o) continue;
    const rec = per.get(q);
    rec.n++;
    if (r.italic) rec.italic.push(o[2].toUpperCase());
  }
  // Every question must offer exactly one italic option, or the italics are not a marking.
  const key = new Map();
  let marked = 0;
  for (const [n, rec] of per) {
    if (!rec.n) continue;
    if (rec.italic.length === 1) { key.set(n, rec.italic[0]); marked++; }
    else if (rec.italic.length > 1) return null;
  }
  return marked && marked === [...per.values()].filter(r => r.n).length ? key : null;
}

function normaliseShapes(linesWithBold, label, italicKey) {
  const rows = linesWithBold.map(r => ({ ...r, text: String(r.text == null ? '' : r.text) }));

  // --- pass 1: line-for-line relabelling and splitting ---
  const out = [];
  let whyBlock = false;          // inside a "Why the other options are incorrect:" list
  let relabelled = 0, capitalised = 0;
  let joinAssetInto = -1;        // index in `out` of a bare "Asset:" awaiting its value
  for (const row of rows) {
    const t = row.text.trim();

    // A BARE "Asset:" LABEL WITH ITS VALUE ON THE NEXT LINE. The final exam writes
    //
    //     Question 1 - Multiple choice, shuffle
    //     Asset:
    //     Module 1, Lesson 2, Video 3: Building the Incident Picture; …
    //
    // and the shared reader's ASSET pattern requires content after the colon, so the label
    // matched nothing and the citation line below it became the first line of the PROMPT.
    // That is why all ten questions reported a four- or five-line prompt and not one of them
    // resolved a reference — the exam would have shipped with the source list printed as part
    // of each question and no feedback pointing anywhere. The reader already does exactly this
    // join for a bare "Correct Explanation:" label; this is the same shape on the Asset line.
    if (joinAssetInto >= 0) {
      if (t) {
        const have = out[joinAssetInto].text.replace(/^Assets?\s*:\s*/i, '');
        // THE CITATION LIST CAN RUN OVER SEVERAL LINES. The final exam's question 2 writes
        //
        //     Asset:
        //     Module 1, Lesson 1, Video 2: Containment, Eradication, and Recovery;
        //     Module 2, Lesson 2, Video 3: A Worked Hunt End to End; Module 3, Lesson 2, …
        //
        // and absorbing only the first line left the second to fall through as an ordinary
        // paragraph — which then became the first line of the PROMPT, so the question reached
        // the learner opening "Module 2, Lesson 2, Video 3: A Worked Hunt End to End; …".
        // A trailing semicolon is the author saying the list continues, so the join follows it.
        out[joinAssetInto] = { ...out[joinAssetInto], text: `Asset: ${have ? have + ' ' + t : t}` };
        relabelled++;
        if (/;\s*$/.test(t)) continue;   // still open: keep absorbing
        joinAssetInto = -1;
        continue;
      }
      // A blank line ENDS an open list, but only once something has been collected; a blank
      // between the label and its first line is just spacing.
      if (/^Assets?\s*:\s*$/i.test(out[joinAssetInto].text)) continue;
      joinAssetInto = -1;
      continue;
    }
    if (/^Assets?\s*:\s*$/i.test(t)) {
      out.push({ ...row, text: t });
      joinAssetInto = out.length - 1;
      continue;
    }

    if (WHY_HEAD.test(t)) { whyBlock = true; continue; }        // the heading itself is dropped
    if (whyBlock) {
      const item = WHY_ITEM.exec(t);
      if (item) {
        out.push({ ...row, text: `Incorrect Explanation — ${item[1]}: ${cap(item[2])}` });
        relabelled++; capitalised++;
        continue;
      }
      if (t) whyBlock = false;   // any other non-blank line ends the list
    }

    const src = SOURCE_LINE.exec(t);
    if (src) { out.push({ ...row, text: `Asset: ${src[1]}` }); relabelled++; continue; }

    // A SEMICOLON WHERE THE COLON SHOULD BE, between an asset's kind and its title. M1L3 Q4
    // writes "Asset: Reading; An Incident-Prioritization Reference". A semicolon is how this
    // format separates TWO assets, so the line read as two citations: a bare "Reading", which
    // matches nothing and was reported as a missing asset, and the title, which resolved on
    // its own. The reference came out right and the warning was noise — but the warning is how
    // a real missing asset is noticed, so the typo is corrected rather than tolerated.
    const semi = KIND_SEMICOLON.exec(t);
    if (semi) {
      out.push({ ...row, text: `${semi[1]}: ${semi[2]}: ${semi[3]}` });
      relabelled++;
      continue;
    }

    const va = VERDICT_ANSWER.exec(t);
    if (va) {
      out.push({ ...row, text: t.replace(VERDICT_ANSWER, `$1$2$3`) });
      relabelled++;
      continue;
    }

    // "Explanation:" only where it is NOT already "Correct Explanation:" / "Incorrect
    // Explanation:", both of which the reader knows and which EXPL_BARE cannot match anyway
    // because they do not begin with "Explanation".
    const ex = EXPL_BARE.exec(t);
    if (ex) { out.push({ ...row, text: `Correct Explanation: ${ex[1]}` }); relabelled++; continue; }

    const glued = GLUED_OPTION.exec(t);
    if (glued && !OPTION_LINE.test(t) && !Q_HEAD_LINE.test(t)) {
      out.push({ ...row, text: glued[1] });
      out.push({ ...row, text: glued[2].trim() });
      shapeWarnings.push(`${label}: a question prompt and its first option were written as one `
        + `paragraph ("…${glued[1].slice(-28)}" + "${glued[2].slice(0, 24)}…") and have been `
        + 'split. Repair the source: as written the question has three options.');
      continue;
    }

    out.push(row);
  }

  // --- pass 2: supply the answer letter where the document states only which are wrong ---
  // Done per question block, after pass 1, so it sees the relabelled Incorrect Explanation
  // lines from shape 4 as well as the ones M4L1 already wrote.
  const final = [];
  let i = 0;
  while (i < out.length) {
    if (!Q_HEAD_LINE.test(out[i].text.trim())) { final.push(out[i]); i++; continue; }
    let j = i + 1;
    while (j < out.length && !Q_HEAD_LINE.test(out[j].text.trim())) j++;
    const block = out.slice(i, j);

    const letters = [], wrong = [];
    let starred = false, hasCorrectAnswer = false, correctExplAt = -1;
    block.forEach((r, k) => {
      const t = r.text.trim();
      const o = OPTION_LINE.exec(t);
      if (o && !/^(Correct|Incorrect)\s+Explanation/i.test(t)) {
        letters.push(o[2].toUpperCase());
        if (o[1]) starred = true;
      }
      const w = INCORRECT_EXPL_LINE.exec(t);
      if (w) wrong.push(w[1].toUpperCase());
      if (/^Correct\s+Answer\s*[:–-]/i.test(t)) hasCorrectAnswer = true;
      if (CORRECT_EXPL_LINE.test(t) && correctExplAt < 0) correctExplAt = k;
    });

    if (!hasCorrectAnswer && !starred && correctExplAt >= 0 && letters.length) {
      // WHAT THE AUTHOR MARKED comes first; the derivation is only a check on it.
      const qn = Number((/^(?:Question\s+(\d+)|Q(\d+))/i.exec(block[0].text.trim()) || [])
        .slice(1).find(Boolean));
      const marked = italicKey && italicKey.get(qn);
      const left = letters.filter(l => !wrong.includes(l));
      const derived = left.length === 1 ? left[0] : null;

      if (marked && derived && marked !== derived) {
        shapeWarnings.push(`${label} Q${qn}: the source marks option ${marked} as correct, but it `
          + `names ${wrong.join(', ')} as incorrect, which leaves ${derived}. The two disagree, so `
          + 'the question is left unkeyed — settle it in the source.');
      } else if (marked) {
        block.splice(correctExplAt, 0,
          { ...block[correctExplAt], text: `Correct Answer: ${marked}` });
      } else if (derived) {
        block.splice(correctExplAt, 0,
          { ...block[correctExplAt], text: `Correct Answer: ${derived}` });
        shapeWarnings.push(`${label} Q${qn}: no option is marked correct, so the answer was taken `
          + `to be ${derived} — the one option of ${letters.length} that the source does not name `
          + 'as incorrect. Confirm it.');
      } else {
        shapeWarnings.push(`${label}: ${block[0].text.trim()} names no correct option, and `
          + `${left.length} of its ${letters.length} options are not named as incorrect `
          + `(${left.join(', ') || 'none'}), so the answer cannot be derived. State it in the source.`);
      }
    }

    final.push(...block);
    i = j;
  }

  if (relabelled) {
    shapeWarnings.push(`${label}: ${relabelled} line(s) rewritten into the import grammar `
      + `(see normaliseShapes)${capitalised ? `, ${capitalised} of them an explanation written as a `
      + 'sentence fragment under its option letter and capitalised to stand alone' : ''}.`);
  }
  return final;
}

// readQuizDoc takes a (lines, label) hook, and the italic marking is a property of the FILE
// rather than of its text, so it is bound here: one normaliser per document.
function normaliserFor(docxDir) {
  const key = italicOptionKey(docxDir);
  return (lines, label) => normaliseShapes(lines, label, key);
}

module.exports = {
  SP, SLUG, DOCS, loadOutline, listDocs, readFileName, norm,
  resolveModule, resolveLesson, resolveAsset, resolveQuestionRefs,
  referenceStyle, referSuffix, referText, refString,
  normaliseShapes, normaliserFor, italicOptionKey, shapeWarnings,
};

// Shared reader for the IBM "Building and Managing Agentic Teams" assessment documents.
//
// All seventeen source files for Deploying and Orchestrating AI Agents — four graded quizzes,
// twelve lesson practice quizzes and one final exam — share ONE question grammar and differ
// only in their header block. That is why this is a library rather than three copies: the
// per-artifact parsers supply the classification and the checks, this supplies the reading.
//
//     Question 1 - Multiple choice, shuffle
//     Asset: Video: How Agents Pass Work to Each Other; Reading: A Coordination Patterns Reference
//     <prompt, one line>
//     A: <option>
//     Feedback: Wrong. <explanation>
//     *B: <option>
//     Feedback: Correct. <explanation>
//     ...
//
// Three things about this source are not negotiable and are handled here rather than in each
// parser, because getting any of them wrong is silent:
//
//   * THE STAR IS NOT RELIABLE. Only ten of the seventeen files mark the key with "*", and two
//     of those mark it on some questions and not others (file 10 stars 1 of 5, file 11 stars 8
//     of 10). The verdict word that opens each feedback — "Correct." or "Wrong." — is present
//     on all 440 options without exception, so THAT is the key, and a star that disagrees with
//     it is reported as a conflict rather than resolved silently.
//   * OPTION LABELS ARE NOT UNIFORM. One option in the Module 3 graded quiz is written "A."
//     instead of "A:". Accepting only the colon form drops the option and leaves the question
//     with three, which the checks would then blame on the wrong thing.
//   * TWO FILES PUT THE WHOLE QUIZ INSIDE LINE BREAKS rather than paragraphs, so lib-lines —
//     which splits on <w:br/> — is the reader, not a paragraph walk. Read with a paragraph
//     walk, "Data Quality, Freshness, and Access" yields zero questions.
const fs = require('fs');
const path = require('path');
const { lines, linesWithBold } = require('./lib-lines');

// "Question 4 - Multiple choice, shuffle" / "Question 4 – Multiple choice, shuffle".
// The source mixes hyphen and en dash; both mean the same thing.
// Three header forms across these sources, and the suffix is not always a question TYPE:
//
//     Question 1 - Multiple choice, shuffle     type
//     Question 2                                no suffix at all
//     Q1 (M1L3V1)                               the suffix is the MAPPING
//     Question 4 - Reading M2L1                 the suffix is a kind plus a lesson
//
// Designing Human-AI Collaboration uses all four, and four of its files switch between them
// mid-document. Reading only the first form lost 26 of its 107 questions outright, and
// treating "Reading M2L1" as a type produced a warning about a question that is perfectly
// well formed. So the suffix is captured and classified rather than assumed to be a type.
//     Question 1 : Multiple choice, shuffle     a COLON, in four files of Course 5
//     Question 1.                              a TRAILING STOP and nothing else
//
// The trailing stop is why `\.?` sits after the number. The suffix group is optional, so a
// bare "Question 1" already matched; "Question 1." did not, because the stop satisfies none
// of the three suffix shapes and `$` then fails. Cybersecurity Course 1 writes two of its
// twelve practice quizzes that way and one of them threw "no Question N header anywhere in
// the document" rather than losing questions quietly, which is how it was found.
const Q_HEAD = /^(?:Question\s+(\d+)|Q(\d+))\s*\.?\s*(?:[-–—:]\s*(.+?)|\((\s*.+?\s*)\)|\s+([A-Za-z].*?))?\s*$/i;
// The suffix can also be a LIST of mappings joined by "+": "M1L1V1 + M1L3 Reading",
// "M3L1 Reading + M3L2V2 + M3L3V1". Two graded quizzes state every question's sources that
// way and carry no Asset line at all, so reading only a single bare code left twenty questions
// with no reference while the mapping sat in plain sight on the header.
const SUFFIX_CODE = /^(M\d+L\d+V\d+)$/i;
const SUFFIX_KIND = /^(Reading|Lab|Video|FAQ|Discussion Prompt|Case Study)\s+(M\d+L\d+)$/i;
// A fourth shape: the suffix IS the asset, written exactly as an "Asset:" line would write
// it — "Question 1 — Video 1: Protect Surface Versus Attack Surface". Three of
// Cybersecurity Course 1's practice quizzes cite their sources this way and carry no Asset
// line at all, so without this the whole suffix was stored as the question TYPE: every one
// of those questions was reported as "not multiple choice" AND as having no reference,
// which is two misleading warnings for a question that is perfectly well formed.
const SUFFIX_ASSET = /^(?:Demo Video|Video|Reading|Lab|FAQ|Discussion Prompt|Case Study)\s*\d*\s*:\s*\S/i;
const SUFFIX_MAPS = new RegExp(
  '(M\\d+L\\d+V\\d+)'                                          // M1L1V1
  + '|(M\\d+L\\d+)\\s+(Reading|Lab|Video|FAQ)'                 // M1L3 Reading
  + '|(Reading|Lab|Video|FAQ)\\s+(M\\d+L\\d+)', 'gi');         // Reading M1L3

// "Correct Answer: C" states the key on its own line instead of starring the option.
const CORRECT_ANSWER = /^Correct\s+Answer\s*[:–-]\s*\*?([\w])/i;
// "Correct Explanation: ..." and "Incorrect Explanation - A: ..." replace "Feedback:".
const CORRECT_EXPL = /^Correct\s+Explanation\s*[:–—-]\s*(.*)$/i;
// "A - Incorrect. <text>" / "B - Correct. <text>" — a third explanation form, under a bare
// "Explanation" heading. The letter leads and the verdict follows it, which is the reverse of
// "Incorrect Explanation - A:". The final exam is written entirely this way.
const LETTER_EXPL = /^([\w])\s*[—–-]\s*(Correct|Incorrect|Right|Wrong)\b\s*[.:,]?\s*(.*)$/i;
const INCORRECT_EXPL = /^Incorrect\s+Explanation\s*[:–—-]*\s*([A-F])\s*[:–—-]\s*(.*)$/i;
// A BARE "Incorrect Explanations:" HEADING, with the letters beneath it. Cybersecurity
// Course 1 writes four of its documents this way, and the lines under the heading look
// exactly like options -- "B. Better detection may shorten response time" -- so without a
// mode they are read as four MORE options and the real options lose their feedback. The
// heading therefore switches the reader into explanation mode until the next question.
const INCORRECT_EXPL_HEAD = /^Incorrect\s+Explanations\s*[:–—-]?\s*$/i;
const LETTERED_LINE = /^\*?\s*([A-F])\s*[:.]\s+(.+)$/;
// "Assets:" as well as "Asset:". GenAIOps Course 3 writes the plural on the ten questions
// that cite more than one item, and singular elsewhere, in both of the grammars it mixes.
// Unrecognised, those lines fell through and the questions cited nothing at all. A tally of
// all 420 stored source documents found the plural only in that course, so the optional "s"
// can only ever match a line that currently matches nothing.
const ASSET = /^Assets?\s*:\s*(.+)$/i;
// "M3L1V2 + M3L2V1 + M3L3V2 + Module 3 Summary Reading" on a line of its own -- see the
// branch that consumes it for why this is deliberately narrow.
// "Sources Integrated:" with the sources on the lines BELOW it, one per line. The final
// exam states every question's material this way, after the prompt and before the options.
// Read as prompt continuation the whole block reaches the learner, which is what it did.
const SOURCES_HEAD = /^Sources?\s+Integrated\s*:?\s*$/i;
const SOURCES_LINE = /^[^.?!]*M\d+L\d+[^.?!]*\s\+\s[^.?!]+$/i;
// A citation line that lists ONE source has no "+" to recognise it by. This happens when a
// reviewer strikes the second source out, leaving "M3L3V3" alone on its line. Kept deliberately
// narrow - the whole line must be nothing but a code and an optional kind - so no prose can
// match it and be swallowed as a citation.
const SOURCES_CODE_ONLY =
  /^M\d+L\d+(?:V\d+)?(?:\s+(?:Demo Video|Video|Reading|Lab|FAQ|Discussion Prompt|Case Study)\s*\d*)?$/i;
// "A:", "*A:", "**A:", "A." — four spellings of the same thing across these sources.
//
// The DOUBLE asterisk is the one that matters. Business Process Automation marks its key with
// "**B:", a markdown bold marker rather than Coursera's single-star convention, on twelve of
// its twenty files. Accepting only a single star does not merely miss the marker — the whole
// option LINE stops matching, so the question silently arrives with three options and no key,
// and the feedback beneath it attaches to nothing. Any run of asterisks is therefore taken as
// the marker, and the builder writes Coursera's single star regardless of how many the source
// used.
const OPTION = /^(\*+)?\s*([A-F])\s*[:.]\s+(.+)$/;
// A STRAY MARK CAN SIT IN FRONT OF THE LABEL. One option in the GenAIOps Course 1 Module 2
// Lesson 3 practice quiz is written ".C: A successful model call …" — a leftover full stop
// ahead of the letter. The line then matches OPTION not at all, so the question arrives with
// three options, its fourth explanation attaches to nothing, and the counts blame the question
// rather than the typo.
//
// Stripped before the match rather than folded into OPTION, deliberately: OPTION's three
// capture groups are read in six places here and widening it would renumber all of them for
// the six courses that share this reader. The mark is reported by whichever parser is running,
// never silently absorbed.
//
// Kept narrow — one run of stops, commas, semicolons, closing brackets, bullets or dashes, and
// only when the line does not already parse as an option. A scan of all 389 stored source
// documents found exactly one line of this shape, which is what makes the allowance safe.
const STRAY_BEFORE_LABEL = /^([.,;)\]•-]+)\s*(?=\**\s*[A-F]\s*[:.]\s+\S)/;
const FEEDBACK = /^Feedback\s*[:–-]\s*(.+)$/i;
// The verdict word the source opens every explanation with. Coursera already tells the learner
// whether the option they chose was right, so the word is consumed as the key and removed from
// the text the learner sees — the same decision every other course in this repo made.
//
// THE PUNCTUATION IS REQUIRED, and the whitespace around it is not. Both halves matter:
//
//   * required, because one explanation in the Module 3 graded quiz reads "Correct. Right
//     signal and timing beat constant paging." Treating a bare leading "Right" as a verdict
//     would swallow the first word of that sentence and key the option twice over.
//   * loose about spacing, because the Module 2 graded quiz writes "Wrong .Coordination
//     patterns…" twice — space before the stop, none after. Matching only "Wrong." leaves a
//     stray period at the head of the learner-facing explanation.
const VERDICT = /^(Correct|Right|Wrong|Incorrect|Not quite)\s*[.!,:]\s*/i;
const IS_CORRECT = /^(Correct|Right)\b/i;

// Marker lines and reference-only scaffolding that can appear inside the source. Anything
// matched here is skipped wherever it falls.
// The Module 1 graded quiz wraps its end marker in asterisks — "*----- End of importable
// content -----*" — so the decoration is part of the pattern rather than assumed away.
// TWO SPELLINGS OF THE CLOSING MARKER. Almost every file writes "End of importable content";
// the GenAIOps Course 2 Module 3 Lesson 3 practice quiz writes "Importable content ends here"
// instead. Unrecognised, it fell through to the question's option list and was reported as
// "unrecognised line after the options", which reads like lost content rather than a marker
// spelled differently. A tally of every marker-shaped line in all stored sources found 125
// "starts here", 119 + 4 + 2 + 1 of the four "End of" variants, and 2 of this one.
//
// Only the SOURCE side is affected. Built documents always carry Coursera's own wording,
// which the builder writes and the verifier checks, so this changes nothing downstream.
const END_TEXT = '(?:End of importable content|Importable content ends here)';
const NOISE = new RegExp(`^[*\\s]*-+\\s*(?:Importable content starts here|${END_TEXT})\\s*-+[*\\s]*$`, 'i');
const END_MARKER = new RegExp(`^[*\\s]*-+\\s*${END_TEXT}\\s*-+[*\\s]*$`, 'i');

const clean = s => String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Splits "Video: A; Reading: B" into [{kind:'Video',title:'A'},{kind:'Reading',title:'B'}].
// The final exam prefixes each with its module ("Module 1 Video: How Agents…"), which is
// captured so the parser can check it against the module the asset actually belongs to.
const ASSET_KIND = /^(?:Module\s+(\d+)\s+)?([A-Za-z][A-Za-z –-]*?)\s*:\s*(.+)$/;

// THE KIND CAN ALSO TRAIL THE TITLE, in parentheses: "The Architecture Without the Jargon
// (Video)". Foundations of Agentic Teams writes all 146 of its citations that way and never
// uses the prefix form. Matching is restricted to the kinds the syllabi actually use, because
// a title can legitimately end in a parenthetical — "Automation Readiness Checklist (IBM
// Consulting playbooks)" does — and only a known kind should be lifted out of one.
const TRAILING_KINDS = ['Day-in-the-Life Video', 'Downloadable Resource', 'Cumulative Project',
  'Discussion Prompt', 'Expert Viewpoints', 'Expert Viewpoint', 'SME Interview', 'Practice Quiz',
  'Graded Quiz', 'Demo Video', 'Case Study', 'Final Exam', 'Reading', 'Video', 'Lab', 'FAQ'];
const TRAILING_KIND = new RegExp(`^(.*\\S)\\s*\\((${TRAILING_KINDS.join('|')})\\)\\s*$`, 'i');

// A citation can also be a MAPPING CODE with its title: "M1L2V1 — Why Some Work Must Stay
// Human". Designing Human-AI Collaboration writes its final exam that way and separates the
// items with COMMAS rather than semicolons, so the split looks for the next code rather than
// for any comma — the titles contain commas of their own.
const ASSET_CODE = /^(M(\d+)L(\d+)(?:V(\d+))?)\s*[—–-]\s*(.+)$/i;
// Sources are joined by ";", "," or "+" depending on the document. Module 3's graded quiz
// uses "+" and mixes codes with plain titles, so the split does not require a code to follow.
const CODE_SPLIT = /\s*(?:[;,]\s*(?=M\d+L\d+)|\s+\+\s+)/i;

function splitAssets(text) {
  const raw = String(text);
  const parts = /M\d+L\d+/i.test(raw) ? raw.split(CODE_SPLIT) : raw.split(';');
  const suffixLessons = [];
  const suffixModules = [];
  return parts.map((part, idx) => {
    let t = clean(part);
    if (!t) return null;
    // A TRAILING ", Lesson N" STATES WHERE THE ASSET LIVES. GenAIOps Course 3 writes
    // "Monitoring AI Systems in Production (Video), Lesson 1" on seventeen of its asset lines,
    // the comma sometimes absent. The trailing-kind branch below expects the bracketed kind to
    // END the string, so the suffix stopped it matching and the whole line was taken as a
    // title that resolved against nothing — every question in the Module 1 graded quiz carried
    // no reference at all.
    //
    // It is not noise to discard: it is the same statement as the M<x>L<y> code the other
    // branches read, so it is captured as statedLesson and checked against where the outline
    // actually puts the asset, exactly as a code would be. A tally of all 420 stored documents
    // found this suffix only in that course.
    const ls = /^(.*\))\s*,?\s*Lesson\s*(\d+)\s*$/i.exec(t);
    if (ls) { t = clean(ls[1]); suffixLessons[idx] = Number(ls[2]); }
    // THE MODULE CAN SIT INSIDE THE SAME PARENTHESIS AS THE KIND. The GenAIOps Course 3 final
    // exam writes "Monitoring AI Systems in Production (Video, Module 1)" on all ten of its
    // asset lines — the exam draws on every module, so each citation says which one. The
    // trailing-kind branch reads what is inside the brackets as the kind, and "Video, Module 1"
    // is not a kind, so every citation in the exam resolved against nothing.
    //
    // Split into the kind the branch expects plus a stated module, which is the same thing the
    // M<x>L<y> codes carry and is checked the same way.
    const km = /^(.*)\((Video|Reading|Lab|FAQ|Demo Video|Case Study|Expert Viewpoint|Discussion Prompt|Downloadable Resource)\s*,\s*Module\s*(\d+)\s*\)\s*$/i.exec(t);
    if (km) { t = clean(`${km[1]}(${km[2]})`); suffixModules[idx] = Number(km[3]); }
    // The code IS the mapping, so it is kept beside the title and the resolver can use it
    // directly rather than matching prose against the outline.
    // "Reading M4L1: A Scoping Cheat Sheet for First Agents" — the kind and the lesson code
    // lead, the title follows the colon. Without this the whole line is taken as a title and
    // matches nothing.
    const kc = /^(Reading|Lab|Video|FAQ|Discussion Prompt|Case Study)\s+M(\d+)L(\d+)\s*:\s*(.+)$/i.exec(t);
    if (kc) {
      return {
        kind: clean(kc[1]),
        title: clean(kc[4]),
        code: null,
        statedModule: Number(kc[2]),
        statedLesson: Number(kc[3]),
        raw: t,
      };
    }
    const ac = ASSET_CODE.exec(t);
    if (ac) {
      return {
        kind: ac[4] ? 'Video' : null,
        title: clean(ac[5]),
        code: ac[1].toUpperCase(),
        statedModule: Number(ac[2]),
        statedLesson: Number(ac[3]),
        raw: t,
      };
    }
    // The trailing form is tried FIRST: "Skills, Agents and Workflows: A Reading (Video)" would
    // otherwise be read as kind "Skills, Agents and Workflows" by the prefix pattern.
    const tk = TRAILING_KIND.exec(t);
    if (tk) {
      const bare = /^Module\s+(\d+)\s+(.+)$/i.exec(clean(tk[1]));
      let title = bare ? clean(bare[2]) : clean(tk[1]);
      // A citation can state the kind at BOTH ends — "FAQ: When Leadership Expects the Platform
      // to Replace the Manager (Reading)", "Lab: Audit a Team Operating Rhythm (Lab)". The
      // leading copy is redundant and has to go, for two reasons: it stops the title matching
      // the outline, which stores it bare, and an FAQ is re-labelled "Reading:" with "FAQ: "
      // restored in front of the title — so leaving it would produce "Reading: FAQ: FAQ: …".
      const lead = new RegExp(`^(?:${TRAILING_KINDS.join('|')})\\s*:\\s*`, 'i');
      title = clean(title.replace(lead, ''));
      return {
        kind: clean(tk[2]),
        title,
        statedModule: bare ? Number(bare[1]) : null,
        raw: t,
      };
    }
    const m = ASSET_KIND.exec(t);
    if (!m) {
      // No "Kind:" prefix — the final exam has two citations written as plain phrases. A
      // leading "Module N" is still the module it is claiming, so it is lifted out here
      // rather than left inside the title, where it would never match the outline.
      const bare = /^Module\s+(\d+)\s+(.+)$/i.exec(t);
      if (bare) return { kind: null, title: clean(bare[2]), statedModule: Number(bare[1]), raw: t };
      return { kind: null, title: t, statedModule: null, raw: t };
    }
    return {
      kind: clean(m[2]),
      title: clean(m[3]),
      statedModule: m[1] ? Number(m[1]) : null,
      raw: t,
    };
  })
    // The ", Lesson N" and "(Kind, Module N)" statements stripped at the top of the mapper,
    // applied to whichever branch the part took. Done here rather than at each of the six
    // return points, and only where the branch did not already state one of its own — a code
    // like "Reading M4L1:" is the stronger statement and keeps precedence.
    .map((o, idx) => {
      if (!o) return o;
      let r = o;
      if (suffixLessons[idx] != null && r.statedLesson == null) r = { ...r, statedLesson: suffixLessons[idx] };
      if (suffixModules[idx] != null && r.statedModule == null) r = { ...r, statedModule: suffixModules[idx] };
      return r;
    })
    .filter(Boolean);
}

// Header fields, each written several ways across the seventeen files:
//   "Module: Handoffs and Coordination with Humans"
//   "Module Name: 1 - Orchestrating Multi-Agent Workflows"
//   "Module name: Module 1 - Orchestrating Multi-Agent Workflows"
//   "Mapped to: Course: …, Module: 3 – Handoffs and Coordination with Humans"
// Returns {num, title} with num null when the line carries no number.
function readModuleRef(text) {
  let t = clean(text);
  const inl = /(?:^|,)\s*Module(?:\s+name)?\s*:\s*(.+)$/i.exec(t);
  if (inl) t = clean(inl[1]);
  t = t.replace(/^Module\s+/i, '');
  const m = /^(\d+)\s*[-–—:]\s*(.+)$/.exec(t);
  if (m) return { num: Number(m[1]), title: clean(m[2]) };
  const n = /^(\d+)$/.exec(t);
  if (n) return { num: Number(n[1]), title: '' };
  return { num: null, title: t };
}

// "Lesson 1: Coordination Patterns…" / "Coordination Patterns…" / "Lesson Name: Lesson 1: …"
function readLessonRef(text) {
  let t = clean(text).replace(/^Lesson\s+name\s*:\s*/i, '');
  const m = /^Lesson\s+(\d+)\s*[:\-–]\s*(.+)$/i.exec(t);
  if (m) return { num: Number(m[1]), title: clean(m[2]) };
  const n = /^Lesson\s+(\d+)$/i.exec(t);
  if (n) return { num: Number(n[1]), title: '' };
  return { num: null, title: t.replace(/^Lesson\s+/i, '') };
}

// The metadata table is flattened by lib-lines into alternating label/value lines, except in
// the three files that write "Label: value" on one line. Both forms are read here.
const SETTING_LABELS = [
  ['gradeToSave', /^Grade to save$/i],
  ['gradeSetting', /^Grade setting(?:\s*\(practice or graded\))?$/i],
  ['questions', /^No\.? of questions$/i],
  ['timeEstimate', /^Time estimate$/i],
  ['attempts', /^Attempts$/i],
  ['passingThreshold', /^Passing threshold$/i],
];

function readSettings(head) {
  const out = {};
  for (let i = 0; i < head.length; i++) {
    const line = clean(head[i]);
    if (!line) continue;
    const inline = /^([^:]{3,40}?)\s*:\s*(.+)$/.exec(line);
    if (inline) {
      const hit = SETTING_LABELS.find(([, re]) => re.test(clean(inline[1])));
      if (hit) { out[hit[0]] = clean(inline[2]); continue; }
    }
    const bare = SETTING_LABELS.find(([, re]) => re.test(line.replace(/:$/, '')));
    if (bare) {
      for (let j = i + 1; j < head.length; j++) {
        if (clean(head[j])) { out[bare[0]] = clean(head[j]); break; }
      }
    }
  }
  return out;
}

// Reads one source document. Returns the header fields, the settings table, the stated
// objectives and the questions — plus `issues`, every deviation this reader had to absorb.
// Nothing is repaired silently: each parser decides what to do with the issue list.
// `opts.normalise`, when given, receives the document's [{text, bold}] lines and returns a
// replacement list. It exists for sources whose questions are laid out as a TABLE rather than
// as paragraphs: lib-lines flattens a table cell by cell, so the rows arrive as a predictable
// run of lines that a course-specific function can fold back into the paragraph grammar this
// reader already understands. GenAIOps Course 3 mixes both layouts across its twelve files
// and is the first to need it.
//
// Opt-in on purpose. Omitted, nothing changes, so no existing course can be affected by a
// transform written for another one's table.
function readQuizDoc(docxDir, label, opts = {}) {
  // Read with formatting: some sources mark the key with BOLD and nothing else, and struck
  // text is deleted text, so the text used here comes from the formatting-aware reader.
  const allBold = linesWithBold(path.join(docxDir, 'word', 'document.xml'))
    // A MARKER AND A QUESTION HEADER CAN SHARE A PARAGRAPH. The GenAIOps Course 2 final exam
    // writes "----- Importable content starts here ----- Question 1 - Multiple choice,
    // shuffle" as one paragraph. That line satisfies neither pattern — NOISE is anchored to
    // end-of-line and Q_HEAD to start-of-line — so it fell through as unrecognised text ahead
    // of the first question header, and Question 1 vanished with its four options and four
    // explanations. The document reported nine questions against a settings table and a
    // syllabus that both say ten, which is the only reason it was caught.
    //
    // Split rather than widened: both patterns keep their anchors and every other document is
    // untouched. A scan of all 407 stored source documents found exactly one line of this
    // shape. The marker half keeps the original line's bold flag; the flag only ever matters
    // for option lines, which neither half is.
    .flatMap(x => {
      const m = /^([*\s]*-+\s*(?:Importable content starts here|End of importable content|Importable content ends here)\s*-+[*\s]*)(\S.*)$/i.exec(x.text);
      return m ? [{ ...x, text: m[1] }, { ...x, text: m[2] }] : [x];
    });
  // See the note on `opts.normalise` above readQuizDoc.
  const normalised = opts.normalise ? opts.normalise(allBold, label) : allBold;
  const all = normalised.map(x => x.text);
  const issues = [];

  const firstQ = all.findIndex(l => Q_HEAD.test(clean(l)));
  if (firstQ < 0) throw new Error(`${label}: no "Question N - …" header anywhere in the document`);
  const head = all.slice(0, firstQ).map(clean);
  const body = all.slice(firstQ).map(clean);
  // `normalised`, not `allBold`: the bold flags are indexed against the SAME list the text
  // came from. Slicing the pre-normalise list would shift every flag by however many lines a
  // transform added or removed, and the flags decide the answer key in the sources that mark
  // it with bold and nothing else.
  const bodyBold = normalised.slice(firstQ).map(x => x.bold);

  // THE FIRST QUESTION'S ASSET LINE CAN SIT ABOVE ITS HEADER, which puts it in `head` and out
  // of the loop's reach. The loop does have a branch for an Asset line "ahead of its own
  // question header", but it can only ever see lines from `body` onwards, so for the FIRST
  // question that branch is unreachable and the line was simply discarded.
  //
  // Three of Optimizing Cost, Latency, and Performance's practice quizzes write every asset
  // that way, above the header it belongs to, and question 1 of each reached the learner with
  // no reference at all while questions 2 onward were correct — a silent one-line loss, not a
  // shift, so the leftover test further down could not catch it either. Zero Trust Security's
  // M4L1 and M4L2 practice quizzes have the same shape and the same missing reference.
  //
  // Only lines at or after the "Importable content starts here" marker are taken: an "Asset:"
  // line above that marker is part of the planning scaffolding, not a citation. A scan of all
  // 178 stored source documents found this construct in 7, and in the 171 others `head` has
  // no Asset line after the marker at all, so nothing else can change.
  // A DOCUMENT WITH NO START MARKER still has a head, and the asset can still be in it.
  // Cybersecurity Course 3's M1L1 practice quiz writes no "Importable content starts here"
  // line at all and puts "Asset: Video: Designing a Repeatable Response Workflow" directly
  // above "Question 1:". With no marker to slice from, this returned nothing and question 1
  // again reached the learner with no reference — the same one-line loss as above, reached by
  // a different route. Searching the whole head is safe: ASSET only matches a line that opens
  // "Asset:", which nothing in a settings table or an objectives list does.
  const headStart = head.findIndex(l => NOISE.test(l));
  const preAssets = (headStart < 0 ? head : head.slice(headStart + 1))
    .map(l => ASSET.exec(l)).filter(Boolean).map(m => clean(m[1]));

  // ---- header ----
  const findHead = re => { const l = head.find(x => re.test(x)); return l || ''; };
  const valueOf = (line, re) => clean(String(line).replace(re, ''));

  const courseLine = findHead(/^Course\s*:/i);
  const moduleLine = findHead(/^(Module\s*(?:name)?\s*:|Mapped to\s*:.*\bModule\b)/i);
  const lessonLine = findHead(/^Lesson(\s+name)?\s*:/i);
  const scopeLine = findHead(/^Scope\s*:/i);

  const settings = readSettings(head);
  const gradeSetting = /practice/i.test(settings.gradeSetting || '') ? 'practice'
    : /graded/i.test(settings.gradeSetting || '') ? 'graded' : null;
  if (!gradeSetting) issues.push('no "Grade setting" row — practice or graded could not be read');

  // The title line is the first non-empty line before the settings table, when there is one.
  // Two files (the Module 4 lesson 3 practice quiz and the final exam) open straight into the
  // table and have no title line at all; those fall back to the caller's label.
  let title = '';
  for (const l of head) {
    if (!l) continue;
    if (SETTING_LABELS.some(([, re]) => re.test(l.replace(/:.*$/, '').trim()))) break;
    if (/^(Course|Module|Lesson|Scope|Mapped to|Field|Value)\b/i.test(l)) break;
    title = l; break;
  }
  if (!title) issues.push('no title line above the settings table — the filename is used instead');

  // Objectives: the bullet list under a "…learning objectives…" heading, ending at the first
  // structural line that follows it.
  const los = [];
  {
    // "…learning objectives addressed in this quiz:" is the usual heading, but the Business
    // Process Automation final exam writes "Learning Objectives for the Final Exam", so the
    // preposition is part of the pattern rather than the word "addressed" alone.
    const LO_LONG = /learning\s*objectives?\s*(addressed|for\b)/i;
    // A BARE "Learning Objectives" heading, with no "addressed in this quiz" after it. Two
    // documents use it as their only heading — Optimizing Cost, Latency, and Performance's
    // M1L3 practice quiz and Monitoring and Observability's M3L3 — and their four objectives
    // each were read as absent, leaving the Guide Section of both with none.
    //
    // THE LONG FORM IS TRIED FIRST, and this is only a fallback, because four other documents
    // carry BOTH: a bare "Learning Objectives" section title with the long sub-heading on the
    // very next line. Matching the bare line there would start the list one line too early and
    // turn "Module-level learning objectives addressed in this quiz:" into an objective of its
    // own. Preferring the long form leaves those four reading exactly as they did.
    // "LEVEL" IS OPTIONAL. Three of this family's documents head the section "Lesson learning
    // objectives" — the qualifier without "level" and without a colon — and the pattern as
    // written required either the full "Lesson-level" or no qualifier at all, so the heading
    // went unrecognised and the quiz read as having no objectives. A sweep of all 450 stored
    // source documents for a line that this widening newly matches found five, and no line
    // that is anything but the section heading:
    //
    //     cyber-course-2  M1L1-PQ, M1L2-PQ, M2L3-PQ      "Lesson learning objectives"
    //     genaiops-c1     M3L1 practice quiz             "Lesson learning objectives"
    //     genaiops-c2     M3L2 practice quiz             "Lesson learning objectives"
    //
    // The last two are DELIVERED documents whose Guide Section shipped with an empty
    // objectives list; they are corrected by rebuilding, which is a separate decision.
    // Nothing else in the corpus changes — checked by byte-diffing all 248 parsers' output.
    // THE QUALIFIER IS ANY RUN OF "course", "module", "lesson" and "level". A FINAL EXAM heads
    // its objectives at COURSE level, which the module/lesson wording could not reach:
    //
    //     cyber-course-3  final exam   "Course / module learning objectives"   6 objectives
    //     genaiops-c1     final exam   "Course learning objectives"            delivered
    //
    // The second is a delivered document whose Guide Section shipped with no objectives. A
    // sweep of all 464 stored sources for a "learning objectives" line that neither pattern
    // matched returned exactly these two, so this widening gains those and touches nothing
    // else — confirmed by byte-diffing all 252 parsers. The anchored end plus the optional
    // colon is what keeps it off a real objective: it must be the whole line.
    const LO_BARE = /^(?:(?:course|module|lesson|level)[-\s\/]*)*learning\s*objectives\s*:?$/i;
    // A SUB-HEADING UNDER THE BARE ONE, which is where the two forms meet. Monitoring and
    // Observability's M3L3 practice quiz writes "Learning Objectives" and then "Lesson-level
    // objectives addressed in this quiz:" — note "objectives" with no "learning" — so the
    // finders below land on the bare line and the loop's very next line is another heading.
    // That one begins "Lesson", which the structural-break test reads as a "Lesson:" field
    // line, so the list ended before it began and all four objectives were lost. Recognised
    // as a heading ahead of that test, it is skipped instead.
    //
    // The trailing colon is required, which is what keeps this off a real objective: the
    // Business Process Automation final exam's own heading, "Learning Objectives for the
    // Final Exam", has none and is matched by LO_LONG as the section start, not skipped.
    const LO_SUBHEAD = /objectives?\b[^:]*\b(?:addressed|for)\b[^:]*:$/i;
    let j = head.findIndex(l => LO_LONG.test(l));
    if (j < 0) j = head.findIndex(l => LO_BARE.test(l));
    if (j < 0) issues.push('no "learning objectives addressed in this quiz" section');
    else {
      for (let k = j + 1; k < head.length; k++) {
        const l = head[k];
        if (!l) continue;
        // A second heading line is a heading, never an objective — see LO_BARE above.
        if (LO_LONG.test(l) || LO_BARE.test(l) || LO_SUBHEAD.test(l)) continue;
        // A FIELD LINE ENDS THE LIST; AN OBJECTIVE THAT OPENS ON THE SAME WORD DOES NOT.
        // Matching the bare word was enough to lose all four objectives of Cybersecurity
        // Course 3's M1L3 practice quiz, whose first one reads "Scope an incident accurately
        // from the available evidence." — "Scope" as a verb, not the "Scope:" field. The list
        // ended before it began and the Guide Section fell back to the module's objectives,
        // which is a quieter failure than an empty section and just as wrong.
        //
        // What these actually have to break on, across the corpus, is a LABEL: "Course: …",
        // "Module Name: 1 - …", "Module 1: …", "Lesson 2: …", "Scope: Modules 1–3",
        // "Mapped to: …", and the bare table-header cells "Field" and "Value". All but the
        // last two carry a colon within a few characters of the word, which is what separates
        // them from a sentence that merely starts there.
        //
        // A BARE FIELD WORD STILL BREAKS, and that half is not optional: GenAIOps Course 3's
        // final exam follows its objectives with a coverage table whose header cells are
        // "Module", "Objectives assessed" and "Questions". Dropping to the colon rule alone
        // let all three through as objectives five, six and seven — caught by byte-diffing
        // every parser, which is the only reason it did not ship.
        if (/^(?:(?:Course|Module|Lesson|Scope|Mapped to)\b[^:]{0,20}:|(?:Course|Module|Lesson|Scope|Field|Value)\s*$)/i
          .test(l)) break;
        if (SETTING_LABELS.some(([, re]) => re.test(l.replace(/:.*$/, '').trim()))) break;
        if (NOISE.test(l)) break;
        if (/^By the end/i.test(l)) continue;
        const t = l.replace(/^[•○▪·\-\s]+/, '').trim();
        // A stray "." sits between the objectives and the Course: line in one source. A line
        // with no letters in it is punctuation, not an objective.
        if (!/[A-Za-z]/.test(t)) continue;
        los.push(t);
      }
      if (!los.length) issues.push('the learning-objectives section lists nothing');
    }
  }

  // ---- questions ----
  // ASSET LINES SIT ON EITHER SIDE OF THEIR QUESTION HEADER. Fifteen files put "Asset:" on the
  // line below the header; the Module 4 Lesson 3 practice quiz puts it on the line ABOVE, for
  // every question but its first. Reading it positionally would shift every reference in that
  // file down by one and leave the last question with none — wrong, and invisible once built.
  // So an Asset line that arrives once the current question already has options belongs to the
  // question about to start, and is held for it.
  const questions = [];
  let q = null;
  let pendingOption = null;   // option awaiting its Feedback line
  // Seeded from `head`: see the note on preAssets. Joined the same way the in-loop branch
  // joins consecutive Asset lines, so one question stating two assets on two lines reads the
  // same whichever side of the header they sit on.
  let carried = preAssets.length ? preAssets.join('; ') : null;
  // THE LABEL AND ITS TEXT CAN SIT ON SEPARATE LINES. Cybersecurity Course 1 writes
  // "Correct Explanation:" / "Incorrect Explanation - A:" on one line and the explanation on
  // the next, where the other courses put both on one. Matching the label and taking its empty
  // capture left every option with no feedback at all and the explanation reported as an
  // unrecognised line. So a label with nothing after it claims the line that follows.
  let pendingExpl = null;     // option whose explanation is on the NEXT line
  let explMode = false;       // past an "Incorrect Explanations:" heading in this question
  let srcMode = false;        // past a "Sources Integrated:" heading in this question
  let li = -1;
  for (const line of body) {
    li++;
    // Everything after the end marker is reference-only scaffolding, not questions. The final
    // exam follows its last question with a score-interpretation table — "9 to 10", "Strong.
    // You are reading scenarios for the work…" — every line of which would otherwise be read
    // as trailing content of question 10.
    if (END_MARKER.test(line)) break;
    if (!line || NOISE.test(line)) continue;

    const qh = Q_HEAD.exec(line);
    if (qh) {
      if (q) questions.push(q);
      pendingOption = null;
      // The suffix is a TYPE, a MAPPING CODE or a KIND-plus-LESSON depending on the file, and
      // sometimes absent. Classify it rather than storing it as a type, so a well-formed
      // "Question 4 — Reading M2L1" does not get reported as a question of the wrong type, and
      // so a "Q1 (M1L3V1)" header's mapping is not thrown away.
      const suffix = clean(qh[3] || qh[4] || qh[5] || '');
      const asCode = SUFFIX_CODE.exec(suffix);
      const asKind = SUFFIX_KIND.exec(suffix);
      const asAsset = (!asCode && !asKind && SUFFIX_ASSET.test(suffix)) ? suffix : null;
      // Every mapping the suffix names, in order. Empty for a suffix that is a question type.
      const maps = [];
      if (!asCode && !asKind) {
        SUFFIX_MAPS.lastIndex = 0;
        let mm;
        while ((mm = SUFFIX_MAPS.exec(suffix)) !== null) {
          if (mm[1]) maps.push({ code: mm[1].toUpperCase() });
          else if (mm[2]) maps.push({ lesson: mm[2].toUpperCase(), kind: clean(mm[3]) });
          else if (mm[5]) maps.push({ lesson: mm[5].toUpperCase(), kind: clean(mm[4]) });
        }
      }
      q = {
        num: Number(qh[1] || qh[2]),
        type: (asCode || asKind || asAsset || maps.length) ? 'Multiple choice' : (suffix || 'Multiple choice'),
        headerCode: asCode ? asCode[1].toUpperCase() : null,
        headerKind: asKind ? { kind: clean(asKind[1]), lesson: asKind[2].toUpperCase() } : null,
        headerMaps: maps,
        assets: [], assetRaw: '',
        prompt: [], options: [], correct: null, starred: [], boldLetters: [], keyLine: null,
      };
      explMode = false;
      srcMode = false;
      if (carried) {
        q.assetRaw = carried;
        q.assets = splitAssets(carried);
        carried = null;
      } else if (asAsset) {
        // The header's own suffix is this question's source material.
        q.assetRaw = asAsset;
        q.assets = splitAssets(asAsset);
      }
      continue;
    }
    // An Asset line can precede the FIRST question header, not just a later one. Four practice
    // quizzes here put it there, and dropping it left question 1 of each with no reference
    // while every other question in the file had one.
    if (!q) {
      const pre = ASSET.exec(line);
      if (pre) carried = carried ? carried + '; ' + clean(pre[1]) : clean(pre[1]);
      continue;
    }

    const as = ASSET.exec(line);
    if (as) {
      const text = clean(as[1]);
      if (q.options.length) { carried = carried ? carried + '; ' + text : text; continue; }
      if (q.assetRaw === text) {
        // THE SAME ASSET STATED TWICE, once above the header and once below the prompt. The
        // M1L1 practice quiz of Optimizing Cost, Latency, and Performance writes question 1
        // both ways; now that the line above the header is no longer discarded, merging would
        // give that question the identical reference twice over in all four of its feedback
        // blocks. A restatement is not a second citation.
        pendingOption = null;
        continue;
      }
      if (q.assetRaw) {
        // A second Asset line inside one question. Merge rather than drop.
        q.assetRaw += '; ' + text;
        q.assets = q.assets.concat(splitAssets(text));
      } else {
        q.assetRaw = text;
        q.assets = splitAssets(text);
      }
      pendingOption = null;
      continue;
    }

    // "Correct Answer: C" — the key on its own line instead of a starred option.
    const ca = CORRECT_ANSWER.exec(line);
    if (ca) { q.keyLine = ca[1].toUpperCase(); pendingOption = null; continue; }

    // "Correct Explanation: …" and "Incorrect Explanation — A: …" — the same information as
    // "Feedback:", addressed to an option by letter rather than by position. The correct one
    // names no letter, so it is attached to whichever option the key line identified.
    const le = LETTER_EXPL.exec(line);
    if (le && q.options.some(o => o.letter === le[1].toUpperCase())) {
      const target = q.options.find(o => o.letter === le[1].toUpperCase());
      target.text_feedback = clean(le[3]);
      target.correct = IS_CORRECT.test(le[2]);
      pendingOption = null;
      continue;
    }

    if (INCORRECT_EXPL_HEAD.test(line)) { explMode = true; pendingOption = null; continue; }
    // Under that heading a lettered line is an EXPLANATION, never another option.
    if (explMode) {
      const el = LETTERED_LINE.exec(line);
      if (el) {
        const target = q.options.find(o => o.letter === el[1].toUpperCase());
        if (target) { target.text_feedback = clean(el[2]); target.correct = false; }
        else issues.push(`Q${q.num}: an incorrect explanation names option ${el[1]}, which the `
          + 'question does not have');
        pendingOption = null;
        continue;
      }
    }

    const ie = INCORRECT_EXPL.exec(line);
    if (ie) {
      const target = q.options.find(o => o.letter === ie[1].toUpperCase());
      if (target) {
        target.text_feedback = clean(ie[2]);
        target.correct = false;
        if (!target.text_feedback) pendingExpl = target;
      }
      else issues.push(`Q${q.num}: an "Incorrect Explanation — ${ie[1]}" names an option the `
        + 'question does not have');
      pendingOption = null;
      continue;
    }
    const ce = CORRECT_EXPL.exec(line);
    if (ce) {
      const target = q.keyLine && q.options.find(o => o.letter === q.keyLine);
      if (target) {
        target.text_feedback = clean(ce[1]);
        target.correct = true;
        if (!target.text_feedback) pendingExpl = target;
      }
      else issues.push(`Q${q.num}: a "Correct Explanation" with no "Correct Answer" line above `
        + 'it, so there is no option to attach it to');
      pendingOption = null;
      continue;
    }

    // The line after a bare explanation label belongs to it.
    if (pendingExpl && line) {
      pendingExpl.text_feedback = clean(line);
      pendingExpl = null;
      continue;
    }

    const fb = FEEDBACK.exec(line);
    if (fb) {
      if (!pendingOption) { issues.push(`Q${q.num}: a Feedback line with no option above it`); continue; }
      const text = clean(fb[1]);
      const v = VERDICT.exec(text);
      if (!v) {
        // NOT reported here. Foundations of Agentic Teams opens only the CORRECT option's
        // feedback with a verdict and lets the three wrong ones simply explain themselves,
        // which is a house style rather than a defect: the question is still keyed, by that
        // one "Correct." and by the star. Whether the absence matters depends on whether the
        // question ends up keyed at all, which is not known until its options have all been
        // read — so it is recorded and judged in the per-question checks below.
        pendingOption.noVerdict = true;
        pendingOption.text_feedback = text;
      } else {
        pendingOption.correct = IS_CORRECT.test(v[1]);
        pendingOption.text_feedback = clean(text.slice(v[0].length));
        if (!pendingOption.text_feedback) {
          issues.push(`Q${q.num} option ${pendingOption.letter}: feedback is the verdict word and `
            + 'nothing else');
        }
      }
      pendingOption = null;
      continue;
    }

    // See STRAY_BEFORE_LABEL: only consulted when the line does not already parse as an
    // option, so a well-formed source never reaches it.
    let optLine = line;
    let strayMark = null;
    if (!OPTION.test(optLine)) {
      const sm = STRAY_BEFORE_LABEL.exec(optLine);
      if (sm) { strayMark = sm[1]; optLine = optLine.slice(sm[1].length).replace(/^\s+/, ''); }
    }
    const op = OPTION.exec(optLine);
    // A prompt sentence can legitimately open "A: " only if it is one character long, so the
    // option test is safe here; but a prompt that has not been seen yet takes precedence,
    // because every question states its prompt before its first option.
    //
    // UNLESS THE QUESTION HAS NO PROMPT AT ALL. One question in Course 5 goes straight from its
    // Asset line to "A:", and taking that first option as the prompt is the worst of both: the
    // question silently loses an option AND keeps an answer where its stem should be. A line
    // that parses as an option, when no prompt has been seen, is an option — and the question
    // is reported as missing its stem, which is a source defect, not a parse one.
    if (op && !q.prompt.length && !q.promptMissing && op[3] && !/^.$/.test(op[3])) {
      issues.push(`Q${q.num}: no question text — the first line after the header already parses `
        + `as option ${op[2]}. The source is missing this question's stem.`);
      q.promptMissing = true;
    }
    if (op && (q.prompt.length || q.promptMissing)) {
      if (strayMark) {
        issues.push(`Q${q.num}: option ${op[2]} is written "${strayMark}${op[2]}:" — a stray `
          + `"${strayMark}" sits in front of the label. Read as option ${op[2]} and the mark `
          + 'dropped; fix the source so the next build does not have to.');
      }
      // AN OPTION AND ITS FEEDBACK CAN SHARE A LINE. Six of these questions run the two
      // together — "A: <option text>.   Feedback: Incorrect. <explanation>" — where the rest
      // put them in separate paragraphs. Taking the whole line as the option text would leave
      // the option carrying the answer key in its own wording and the question with no
      // feedback at all, which is how this first surfaced: a build that stopped on "no
      // feedback". Split on the label and handle both halves here.
      let text = clean(op[3]);
      let inlineFb = null;
      const split = /\s+Feedback\s*[:–-]\s*(.+)$/i.exec(text);
      if (split) {
        inlineFb = clean(split[1]);
        text = clean(text.slice(0, split.index));
      }
      pendingOption = {
        letter: op[2], starred: !!op[1], text,
        correct: null, text_feedback: '',
      };
      if (op[1]) q.starred.push(op[2]);
      if (bodyBold[li]) q.boldLetters.push(op[2]);
      q.options.push(pendingOption);
      if (inlineFb) {
        const v = VERDICT.exec(inlineFb);
        if (!v) {
          // Same judgement as the separate-line path: a wrong option may simply explain itself,
          // and whether that matters depends on the question being keyed by another option.
          pendingOption.noVerdict = true;
          pendingOption.text_feedback = inlineFb;
        } else {
          pendingOption.correct = IS_CORRECT.test(v[1]);
          pendingOption.text_feedback = clean(inlineFb.slice(v[0].length));
        }
        pendingOption = null;
      }
      continue;
    }

    // A SOURCES LINE OF ITS OWN. Module 3's graded quiz writes the header suffix as a count
    // -- "Question 1 - Integrated Across 4 Areas" -- and puts the sources on the line below
    // it, joined by "+": "M3L1V2 + M3L2V1 + M3L3V2 + Module 3 Summary Reading". Read as
    // prompt text it reaches the LEARNER as a row of codes above the question, which is
    // exactly what it did. It carries the same information as an "Asset:" line, so it is
    // read as one. Guarded tightly: before any prompt or option, at least two parts, at
    // least one mapping code, and no sentence punctuation -- a prompt containing a "+" is
    // left alone.
    // The "Sources Integrated:" block: everything until the first option belongs to it.
    if (SOURCES_HEAD.test(line)) { srcMode = true; pendingOption = null; continue; }
    if (srcMode) {
      if (OPTION.test(line) || FEEDBACK.test(line) || CORRECT_ANSWER.test(line)) {
        srcMode = false;          // the block has ended; handle this line normally
      } else {
        if (line) {
          q.assetRaw = q.assetRaw ? q.assetRaw + '; ' + line : line;
          q.assets = splitAssets(q.assetRaw);
        }
        continue;
      }
    }
    if (!q.prompt.length && !q.options.length
        && (SOURCES_LINE.test(line) || SOURCES_CODE_ONLY.test(line))) {
      q.assetRaw = q.assetRaw ? q.assetRaw + '; ' + line : line;
      q.assets = splitAssets(q.assetRaw);
      pendingOption = null;
      continue;
    }
    if (!q.options.length) { q.prompt.push(line); pendingOption = null; continue; }
    // Anything after the options that is not an option or a feedback line is a continuation
    // of the last feedback — the source does not do this, but a revision might.
    issues.push(`Q${q.num}: unrecognised line after the options: ${line.slice(0, 60)}`);
  }
  if (q) questions.push(q);

  // WHICH QUESTION DOES AN ASSET LINE BETWEEN TWO QUESTIONS BELONG TO? Both answers occur.
  // Deploying and Orchestrating AI Agents puts it above the header it belongs to; Designing
  // Human-AI Collaboration puts it below its own question's options. Read the wrong way round,
  // every reference in the file shifts by one — wrong, and invisible once built.
  //
  // The leftover decides it. Carrying forward is the default, and it is right whenever it
  // consumes cleanly. When instead it leaves an orphan AFTER the last question and the FIRST
  // question with nothing, the file is the other kind, and every asset moves back one.
  if (carried && questions.length && !questions[0].assets.length
      && questions.every((qq, i) => i === 0 || qq.assets.length)) {
    for (let i = 0; i < questions.length - 1; i++) {
      questions[i].assets = questions[i + 1].assets;
      questions[i].assetRaw = questions[i + 1].assetRaw;
    }
    const last = questions[questions.length - 1];
    last.assetRaw = carried;
    last.assets = splitAssets(carried);
    carried = null;
  }
  if (carried) {
    issues.push(`an "Asset: ${carried.slice(0, 50)}" line follows the last question with no `
      + 'question header after it, so it references nothing');
  }

  // ---- per-question checks ----
  for (const qq of questions) {
    if (!qq.prompt.length) issues.push(`Q${qq.num}: no prompt line between the header and the options`);
    if (qq.prompt.length > 1) {
      // The REASON this message used to give — "a second prompt paragraph is an unmatched line
      // for the importer" — is the hypothesis SETUP section 7 records as retired on
      // 2026-09-29, so quoting it here contradicted the repo's own documentation. The joining
      // itself stays, on better evidence: CSTP Course 4 was built with the source's two prompt
      // paragraphs and Coursera rejected the WHOLE document with the importable-content-marker
      // error, while HAWS Courses 3 and 4, built the same week with single-paragraph prompts,
      // imported cleanly. Joining loses no word — only the paragraph break becomes a space.
      issues.push(`Q${qq.num}: prompt is ${qq.prompt.length} lines, joined into one. A `
        + 'multi-paragraph prompt is what Coursera rejected the CSTP Course 4 upload over; the '
        + 'break becomes a space and no word is lost.');
    }
    if (!qq.assets.length) issues.push(`Q${qq.num}: no "Asset:" line — no reference can be written`);
    if (qq.options.length !== 4) issues.push(`Q${qq.num}: ${qq.options.length} options, expected 4`);

    // A "Correct Answer: C" line is a third statement of the key, beside the star and the
    // verdict word. Where it is the ONLY one, it is the key; where another exists too, the two
    // must agree — a disagreement is reported and the question left unkeyed, exactly as a
    // star that contradicts a verdict is.
    if (qq.keyLine) {
      const named = qq.options.find(o => o.letter === qq.keyLine);
      if (!named) {
        issues.push(`Q${qq.num}: "Correct Answer: ${qq.keyLine}" names an option the question `
          + 'does not have');
      } else if (qq.options.some(o => o.correct === true && o.letter !== qq.keyLine)) {
        issues.push(`Q${qq.num}: "Correct Answer: ${qq.keyLine}" disagrees with the option whose `
          + 'explanation says it is correct — this question needs a human decision');
        qq.options.forEach(o => { o.correct = null; });
      } else {
        named.correct = true;
      }
    }
    const keyed = qq.options.filter(o => o.correct === true).map(o => o.letter);
    // THE STAR KEYS THE QUESTION WHEN NOTHING ELSE DOES. Coursera's own convention marks the
    // answer with a star, so a document whose feedback simply explains each option without
    // opening "Correct."/"Wrong." is still unambiguously keyed. Cybersecurity Course 1 writes
    // three of its practice quizzes that way and every question in them was refused for having
    // no key, while the source states the key plainly on the option line. Only ever trusted
    // when exactly one option is starred; two stars stay an error, reported below.
    const starKeyed = keyed.length === 0 && qq.starred.length === 1;
    // BOLD IS A KEY TOO, when nothing else is one. A source that emphasises the correct
    // option and marks it no other way is still unambiguously keyed, and read as plain text
    // such a document has no key at all -- Cybersecurity Course 1's Module 4 Lesson 2
    // practice quiz is written that way and every one of its questions was refused. Trusted
    // only when exactly one option is bold and nothing else keyed the question; a bold run
    // inside a longer option does not count, which linesWithBold already enforces.
    const boldKeyed = keyed.length === 0 && !starKeyed && qq.boldLetters.length === 1;
    // A verdict-less option only matters when the question is NOT otherwise keyed. With exactly
    // one "Correct." among the four, the remaining three are wrong by construction — and a
    // starred key makes the same guarantee.
    if (keyed.length !== 1 && !starKeyed && !boldKeyed) {
      for (const o of qq.options.filter(o => o.noVerdict)) {
        issues.push(`Q${qq.num} option ${o.letter}: feedback opens with no Correct/Wrong verdict, `
          + 'and the question is not keyed by any other option, so it cannot be keyed at all');
      }
    }
    if (keyed.length === 1) qq.correct = keyed[0];
    else if (starKeyed) qq.correct = qq.starred[0];
    else if (boldKeyed) qq.correct = qq.boldLetters[0];
    else if (keyed.length === 0) issues.push(`Q${qq.num}: no option's feedback says "Correct"`);
    else issues.push(`Q${qq.num}: ${keyed.length} options say "Correct" (${keyed.join(', ')})`);

    // The star, where the source bothered to write one, must agree with the verdict.
    // Bold that disagrees with a key established another way is reported, never silently used.
    if (qq.correct && qq.boldLetters.length === 1 && qq.boldLetters[0] !== qq.correct
        && !boldKeyed) {
      issues.push(`Q${qq.num}: option ${qq.boldLetters[0]} is bold but ${qq.correct} is the one `
        + 'keyed by the source — the two disagree and this question needs a human decision');
    }
    if (qq.starred.length > 1) {
      issues.push(`Q${qq.num}: ${qq.starred.length} options are starred (${qq.starred.join(', ')})`);
    } else if (qq.starred.length === 1 && qq.correct && qq.starred[0] !== qq.correct) {
      issues.push(`Q${qq.num}: the source stars ${qq.starred[0]} but ${qq.correct}'s feedback is the `
        + 'one that says "Correct" — the two disagree and this question needs a human decision');
      qq.correct = null;
    }
    // TWO OPTIONS WITH THE SAME TEXT. Coursera rejects the question outright — "Duplicate
    // answers are not allowed" — so this is a build-stopping defect, not a style note. It is
    // also invisible in every other check: the question has four options, one key, four
    // feedback blocks, and resolves its reference. The Business Process Automation Module 4
    // Lesson 1 practice quiz shipped with all four options identical in all five questions,
    // and Coursera refused the whole file.
    //
    // It cannot be repaired here. Distinct feedback under identical options means the
    // distractors were never written, and inventing them is authoring assessment content.
    {
      const seen = new Map();
      for (const o of qq.options) {
        const k = o.text.replace(/\s+/g, ' ').trim().toLowerCase();
        if (!k) continue;
        if (seen.has(k)) {
          issues.push(`Q${qq.num}: options ${seen.get(k)} and ${o.letter} have the same text. `
            + 'Coursera rejects the question ("Duplicate answers are not allowed"); the source '
            + 'needs distinct distractors before this can be built.');
        } else seen.set(k, o.letter);
      }
    }
    if (!/multiple choice/i.test(qq.type)) {
      issues.push(`Q${qq.num}: question type is "${qq.type}", not multiple choice — this builder `
        + 'only writes single-answer multiple choice');
    }
  }

  const declared = Number(String(settings.questions || '').replace(/\D+/g, ''));
  if (declared && declared !== questions.length) {
    issues.push(`the settings table declares ${declared} questions but the document contains `
      + `${questions.length}; the document is what gets built`);
  }

  return {
    title, courseTitle: valueOf(courseLine, /^Course\s*:\s*/i),
    moduleRef: moduleLine ? readModuleRef(moduleLine) : null,
    lessonRef: lessonLine ? readLessonRef(valueOf(lessonLine, /^Lesson(\s+name)?\s*:\s*/i)) : null,
    scope: valueOf(scopeLine, /^Scope\s*:\s*/i),
    gradeSetting, settings, los, questions, issues,
  };
}

module.exports = { readQuizDoc, splitAssets, clean };

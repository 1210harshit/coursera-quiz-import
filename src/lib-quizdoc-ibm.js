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
const { lines } = require('./lib-lines');

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
const Q_HEAD = /^(?:Question\s+(\d+)|Q(\d+))\s*(?:[-–—]\s*(.+?)|\((\s*.+?\s*)\)|\s+([A-Za-z].*?))?\s*$/i;
// The suffix can also be a LIST of mappings joined by "+": "M1L1V1 + M1L3 Reading",
// "M3L1 Reading + M3L2V2 + M3L3V1". Two graded quizzes state every question's sources that
// way and carry no Asset line at all, so reading only a single bare code left twenty questions
// with no reference while the mapping sat in plain sight on the header.
const SUFFIX_CODE = /^(M\d+L\d+V\d+)$/i;
const SUFFIX_KIND = /^(Reading|Lab|Video|FAQ|Discussion Prompt|Case Study)\s+(M\d+L\d+)$/i;
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
const ASSET = /^Asset\s*:\s*(.+)$/i;
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
const NOISE = /^[*\s]*-+\s*(Importable content starts here|End of importable content)\s*-+[*\s]*$/i;
const END_MARKER = /^[*\s]*-+\s*End of importable content\s*-+[*\s]*$/i;

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
const CODE_SPLIT = /\s*[;,]\s*(?=M\d+L\d+)/i;

function splitAssets(text) {
  const raw = String(text);
  const parts = /M\d+L\d+/i.test(raw) ? raw.split(CODE_SPLIT) : raw.split(';');
  return parts.map(part => {
    const t = clean(part);
    if (!t) return null;
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
  }).filter(Boolean);
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
function readQuizDoc(docxDir, label) {
  const all = lines(path.join(docxDir, 'word', 'document.xml'));
  const issues = [];

  const firstQ = all.findIndex(l => Q_HEAD.test(clean(l)));
  if (firstQ < 0) throw new Error(`${label}: no "Question N - …" header anywhere in the document`);
  const head = all.slice(0, firstQ).map(clean);
  const body = all.slice(firstQ).map(clean);

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
    const j = head.findIndex(l => /learning\s*objectives?\s*(addressed|for\b)/i.test(l));
    if (j < 0) issues.push('no "learning objectives addressed in this quiz" section');
    else {
      for (let k = j + 1; k < head.length; k++) {
        const l = head[k];
        if (!l) continue;
        if (/^(Course|Module|Lesson|Scope|Mapped to|Field|Value)\b/i.test(l)) break;
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
  let carried = null;         // Asset line read ahead of its own question header
  for (const line of body) {
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
        type: (asCode || asKind || maps.length) ? 'Multiple choice' : (suffix || 'Multiple choice'),
        headerCode: asCode ? asCode[1].toUpperCase() : null,
        headerKind: asKind ? { kind: clean(asKind[1]), lesson: asKind[2].toUpperCase() } : null,
        headerMaps: maps,
        assets: [], assetRaw: '',
        prompt: [], options: [], correct: null, starred: [], keyLine: null,
      };
      if (carried) {
        q.assetRaw = carried;
        q.assets = splitAssets(carried);
        carried = null;
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

    const ie = INCORRECT_EXPL.exec(line);
    if (ie) {
      const target = q.options.find(o => o.letter === ie[1].toUpperCase());
      if (target) { target.text_feedback = clean(ie[2]); target.correct = false; }
      else issues.push(`Q${q.num}: an "Incorrect Explanation — ${ie[1]}" names an option the `
        + 'question does not have');
      pendingOption = null;
      continue;
    }
    const ce = CORRECT_EXPL.exec(line);
    if (ce) {
      const target = q.keyLine && q.options.find(o => o.letter === q.keyLine);
      if (target) { target.text_feedback = clean(ce[1]); target.correct = true; }
      else issues.push(`Q${q.num}: a "Correct Explanation" with no "Correct Answer" line above `
        + 'it, so there is no option to attach it to');
      pendingOption = null;
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

    const op = OPTION.exec(line);
    // A prompt sentence can legitimately open "A: " only if it is one character long, so the
    // option test is safe here; but a prompt that has not been seen yet takes precedence,
    // because every question states its prompt before its first option.
    if (op && q.prompt.length) {
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
      issues.push(`Q${qq.num}: prompt is ${qq.prompt.length} lines; they are joined into one, `
        + 'because a second prompt paragraph is an unmatched line for the importer');
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
    // A verdict-less option only matters when the question is NOT otherwise keyed. With exactly
    // one "Correct." among the four, the remaining three are wrong by construction.
    if (keyed.length !== 1) {
      for (const o of qq.options.filter(o => o.noVerdict)) {
        issues.push(`Q${qq.num} option ${o.letter}: feedback opens with no Correct/Wrong verdict, `
          + 'and the question is not keyed by any other option, so it cannot be keyed at all');
      }
    }
    if (keyed.length === 1) qq.correct = keyed[0];
    else if (keyed.length === 0) issues.push(`Q${qq.num}: no option's feedback says "Correct"`);
    else issues.push(`Q${qq.num}: ${keyed.length} options say "Correct" (${keyed.join(', ')})`);

    // The star, where the source bothered to write one, must agree with the verdict.
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

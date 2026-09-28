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
const Q_HEAD = /^Question\s+(\d+)\s*[-–—]\s*(.+)$/i;
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
const NOISE = /^-+\s*(Importable content starts here|End of importable content)\s*-+$/i;

const clean = s => String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Splits "Video: A; Reading: B" into [{kind:'Video',title:'A'},{kind:'Reading',title:'B'}].
// The final exam prefixes each with its module ("Module 1 Video: How Agents…"), which is
// captured so the parser can check it against the module the asset actually belongs to.
const ASSET_KIND = /^(?:Module\s+(\d+)\s+)?([A-Za-z][A-Za-z –-]*?)\s*:\s*(.+)$/;

function splitAssets(text) {
  return String(text).split(';').map(part => {
    const t = clean(part);
    if (!t) return null;
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
    if (!line || NOISE.test(line)) continue;

    const qh = Q_HEAD.exec(line);
    if (qh) {
      if (q) questions.push(q);
      pendingOption = null;
      q = {
        num: Number(qh[1]), type: clean(qh[2]), assets: [], assetRaw: '',
        prompt: [], options: [], correct: null, starred: [],
      };
      if (carried) {
        q.assetRaw = carried;
        q.assets = splitAssets(carried);
        carried = null;
      }
      continue;
    }
    if (!q) continue;

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

    const fb = FEEDBACK.exec(line);
    if (fb) {
      if (!pendingOption) { issues.push(`Q${q.num}: a Feedback line with no option above it`); continue; }
      const text = clean(fb[1]);
      const v = VERDICT.exec(text);
      if (!v) {
        issues.push(`Q${q.num} option ${pendingOption.letter}: feedback opens with no `
          + 'Correct/Wrong verdict, so this option cannot be keyed');
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
          issues.push(`Q${q.num} option ${pendingOption.letter}: feedback shares the option's line `
            + 'and opens with no Correct/Wrong verdict, so this option cannot be keyed');
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

    const keyed = qq.options.filter(o => o.correct === true).map(o => o.letter);
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

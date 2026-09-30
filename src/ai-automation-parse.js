// Parser for "Deploying, Governing, Measuring, and Scaling AI-Powered Automation" — seventeen
// assessment documents (12 practice quizzes, 4 module graded quizzes, 1 final exam), each its
// own .docx, unzipped into work/ai-automation/src/<file name>/.
//
//   node src/ai-automation-parse.js            > work/ai-automation/quizzes.json
//   node src/ai-automation-parse.js --report     counts, layouts, reference resolution, warnings
//
// The seventeen files were written by several hands and use three different question layouts,
// sometimes two in one file. Each question block is classified on its own:
//
//   LETTERED   "A: ..." / "*C: ..." / "**A: ..." options, each followed by its explanation.
//              The explanation may carry a "Feedback:" label or open directly with a verdict
//              ("Not quite. ..."). A long option is sometimes split across two list
//              paragraphs; those halves are rejoined with one space.
//   ALTERNATE  unlettered list options, each followed by "Feedback: ..." or a bare verdict line.
//              Letters are positional, A-D in source order.
//   KEYED      four unlettered options, then "Correct Answer: B", "Correct Explanation: ...",
//              and "Incorrect Explanation — A: ..." per remaining letter.
//
// The key is taken from every signal the block offers — a * / ** marker, a "Correct Answer:"
// line, and the verdict word opening each explanation ("Correct." / "Correct!") — and the
// signals must agree. A block where they disagree, or where none exists, stops the parse.
//
// References name assets by TITLE ("Asset: Video: Judging Assistant Responses"), never by
// number, and no outline exists. Module and lesson are resolved from the practice quizzes,
// which each state their own module and lesson: a title's lesson is the lesson whose practice
// quiz cites it. See resolveAssets.
//
// Corrections the course owner asked for on top of the sources — a replacement question, a
// missing full stop, a setting the source leaves out — live in work/ai-automation/fixes.json,
// NOT in the source documents and NOT in this repository (they are course content). Each fix
// names the exact source text it expects and the parse stops if that text is absent, so a
// revised source can never have a stale fix silently applied to it. Every question a fix
// touches carries a "fixes" list, which the verifier reads to exempt exactly those fields from
// its source-fidelity check. See applyFixes.
const fs = require('fs');
const path = require('path');
const { lines: readLines } = require('./lib-lines');
const { punctuate } = require('./lib-punctuation');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SRC = path.join(SP, 'ai-automation', 'src');
const report = process.argv.includes('--report');
const warns = [];
const warn = m => warns.push(m);
const die = m => { console.error('ERROR ' + m); process.exit(1); };

// ---------- line classes ----------
// Tolerant of the stray asterisks and short dash runs these sources have: "-----...-----*".
const START_RE = /^\*?-{3,}\s*Importable content starts here\s*-{3,}\*?$/i;
const END_RE = /^\*?-{3,}\s*End\b.*-{3,}\*?$/i;
const HEADER_RE = /^Question\s+(\d+)\s*[-–—]\s*(.+)$/i;
const ASSET_RE = /^(?:Asset Mapping:\s*)?Assets?:\s*(.*)$/i;
const ASSET_ITEM_RE = /^(Video|Reading|Lab|Discussion|Quiz)\s*:\s*(.+)$/i;
const RULE_RE = /^[—–_\-=]{5,}$/;
const LETTERED_RE = /^(\*{1,2})?\s*([A-D])\s*[:.)]\s+(.*)$/;
const FEEDBACK_RE = /^Feedback\s*:\s*(.*)$/i;
// A verdict opening an explanation. Punctuation is required, so a sentence that merely begins
// with the word ("Correct data is ...") is not mistaken for one.
const VERDICT_RE = /^(Correct|Incorrect|Not quite|Wrong)\s*[.!:,—–-]\s*/i;
const KEY_RE = /^Correct Answer\s*:\s*([A-D])\s*$/i;
const KEY_EXPL_RE = /^Correct Explanation\s*:\s*(.+)$/i;
const WRONG_EXPL_RE = /^Incorrect Explanation\s*[—–-]?\s*([A-D])\s*:\s*(.+)$/i;
// The running number some sources put on the prompt: "Q.1: ...", "Q.2 ...". It is structure —
// the document's own "Question N" header replaces it — and "Q.1:" at the start of a line is
// exactly the one-word label the importer reads as an answer option.
const QNUM_RE = /^Q\.?\s?\d+\s*[:.)]?\s+/;

const isFeedbackLine = l => FEEDBACK_RE.test(l) || VERDICT_RE.test(l);
const feedbackText = l => { const m = FEEDBACK_RE.exec(l); return (m ? m[1] : l).trim(); };
const verdictOf = t => { const m = VERDICT_RE.exec(t); return m ? m[1].toLowerCase() : null; };

// ---------- file-level metadata ----------
function fileIdentity(name, first, second) {
  // Module and lesson come from the file name, which every file states consistently; the
  // document's own second line is checked against it where it exists.
  let kind, module, lesson = null;
  let m;
  if ((m = /^PQ-M(\d+)L(\d+)$/i.exec(name))) { kind = 'practice'; module = +m[1]; lesson = +m[2]; }
  else if ((m = /^Final Exam - M(\d+)L(\d+)$/i.exec(name))) { kind = 'final'; module = +m[1]; lesson = +m[2]; }
  else if ((m = /^GQ-M(\d+)L\d+$/i.exec(name))) { kind = 'graded'; module = +m[1]; }
  else if ((m = /Module\s*(\d+)$/i.exec(name))) { kind = 'graded'; module = +m[1]; }
  else die(`cannot tell what ${name}.docx is from its name`);

  const wantKind = { practice: /Practice Quiz/i, graded: /Graded Quiz/i, final: /Final Exam/i }[kind];
  if (!wantKind.test(first)) die(`${name}: title "${first}" does not say ${kind}`);
  // "Practice Quiz: Title", "Title: Practice Quiz", and the one heading glued to its module
  // line with no break ("...GovernanceModule 2") all reduce to the bare title.
  const title = first
    .replace(/Module\s*\d+(\s*Lesson\s*\d+)?\s*$/i, '')
    .replace(/^(?:Practice Quiz|Graded Quiz|Final Exam)\s*:\s*/i, '')
    .replace(/\s*:\s*(?:Practice Quiz|Graded Quiz|Final Exam)\s*$/i, '')
    .trim();
  const stated = /Module\s*(\d+)(?:\s*Lesson\s*(\d+))?/i.exec(first + ' ' + second);
  if (stated && +stated[1] !== module) die(`${name}: document says Module ${stated[1]}, file name says ${module}`);
  if (stated && stated[2] && lesson !== null && +stated[2] !== lesson)
    die(`${name}: document says Lesson ${stated[2]}, file name says ${lesson}`);
  return { kind, module, lesson, title };
}

function settingsOf(ls) {
  const get = re => { const i = ls.findIndex(l => re.test(l)); return i >= 0 ? ls[i + 1] : null; };
  return {
    gradeToSave: get(/^Grade to save$/i),
    gradeSetting: get(/^Grade setting\b/i),
    questions: get(/^No\. of questions$/i),
    timeEstimate: get(/^Time estimate$/i),
    attempts: get(/^Attempts$/i),
    passing: get(/^Passing threshold$/i),
  };
}

function objectivesOf(ls, stop) {
  const at = ls.findIndex(l => /objectives/i.test(l));
  if (at < 0 || at > stop) return [];
  const out = [];
  for (let i = at + 1; i < stop; i++) {
    const l = ls[i];
    if (!l) continue;
    if (/objectives/i.test(l) && /:$/.test(l)) continue;          // a second, nested header
    if (/^(Course|Module|Lesson)\b/i.test(l) || HEADER_RE.test(l) || START_RE.test(l)) break;
    // One source runs its bullets together in a single paragraph: "• a.• b.• c."
    for (const part of l.split('•')) if (part.trim()) out.push(part.trim());
  }
  return out;
}

// ---------- assets ----------
function parseAssets(text, where) {
  return text.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const m = ASSET_ITEM_RE.exec(s);
    if (!m) die(`${where}: cannot read asset "${s}"`);
    let title = m[2].trim();
    let lessonHint = null;
    // Trailing annotations are metadata, not title: "(7 mins)", "(Lesson 1)".
    for (;;) {
      const d = /\s*\((\d+)\s*mins?\)\s*$/i.exec(title);
      const l = /\s*\(Lesson\s*(\d+)\)\s*$/i.exec(title);
      if (d) { title = title.slice(0, d.index).trim(); continue; }
      if (l) { lessonHint = +l[1]; title = title.slice(0, l.index).trim(); continue; }
      break;
    }
    const type = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return { type, title, lessonHint };
  });
}

// ---------- one question block ----------
function parseBlock(blk, where) {
  const head = HEADER_RE.exec(blk[0]);
  if (!/multiple choice/i.test(head[2])) die(`${where}: not multiple choice: "${blk[0]}"`);
  let rest = blk.slice(1).filter(l => l && !RULE_RE.test(l));

  // Asset line(s). A second asset sometimes sits alone on the next line ("Reading: ..."), and
  // in one source the prompt is glued to the end of the asset line with no break at all
  // ("... for AutomationQ.7: To prevent ...").
  const ai = rest.findIndex(l => ASSET_RE.test(l));
  if (ai < 0) die(`${where}: no Asset line`);
  if (ai > 0) die(`${where}: text before the Asset line: "${rest[0].slice(0, 60)}"`);
  let assetText = ASSET_RE.exec(rest[0])[1];
  let glued = null;
  const g = /^(.*?)(Q\.?\s?\d+\s*:\s*.+)$/.exec(assetText);
  if (g) { assetText = g[1]; glued = g[2]; warn(`${where}: prompt was glued to the Asset line; split at "${glued.slice(0, 6)}"`); }
  rest = rest.slice(1);
  while (rest.length && ASSET_ITEM_RE.test(rest[0]) && !LETTERED_RE.test(rest[0])) {
    assetText += '; ' + rest[0];
    rest = rest.slice(1);
  }
  if (glued) rest.unshift(glued);
  const assets = parseAssets(assetText, where);

  let layout, promptLines, options, feedback = {}, keySignals = [];

  if (rest.some(l => KEY_RE.test(l))) {
    layout = 'KEYED';
    const k = rest.findIndex(l => KEY_RE.test(l));
    const key = KEY_RE.exec(rest[k])[1];
    keySignals.push(['Correct Answer line', key]);
    const before = rest.slice(0, k);
    if (before.length < 5) die(`${where}: KEYED block has ${before.length} lines before the key`);
    const opts = before.slice(-4);
    promptLines = before.slice(0, -4);
    options = opts.map((t, i) => ({ letter: 'ABCD'[i], text: t }));
    for (const l of rest.slice(k + 1)) {
      let m;
      if ((m = KEY_EXPL_RE.exec(l))) feedback[key] = m[1].trim();
      else if ((m = WRONG_EXPL_RE.exec(l))) {
        if (m[1] === key) die(`${where}: "Incorrect Explanation" given for the keyed answer ${key}`);
        feedback[m[1]] = m[2].trim();
      } else die(`${where}: unrecognised line after the key: "${l.slice(0, 60)}"`);
    }
  } else if (rest.filter(l => LETTERED_RE.test(l)).length >= 4) {
    layout = 'LETTERED';
    const first = rest.findIndex(l => LETTERED_RE.test(l));
    promptLines = rest.slice(0, first);
    options = [];
    let cur = null, inFb = false;
    for (const l of rest.slice(first)) {
      const m = LETTERED_RE.exec(l);
      if (m && m[2] === 'ABCD'[options.length]) {
        // An explanation may share the option's paragraph with no break: "...text.Feedback: ..."
        let text = m[3], fb = null;
        const inl = /^(.*?\S)\s*Feedback\s*:\s*(.+)$/.exec(text);
        if (inl) { text = inl[1]; fb = inl[2]; warn(`${where} ${m[2]}: explanation shared the option's line; split`); }
        cur = { letter: m[2], text: text.trim(), stars: m[1] || '' };
        options.push(cur);
        inFb = fb !== null;
        if (inFb) feedback[cur.letter] = fb.trim();
        continue;
      }
      if (!cur) die(`${where}: line before first option: "${l}"`);
      if (!inFb && isFeedbackLine(l)) { feedback[cur.letter] = feedbackText(l); inFb = true; continue; }
      if (!inFb) {
        // Second half of an option the source split across two list paragraphs.
        cur.text += ' ' + l;
        warn(`${where} ${cur.letter}: option continued on a second line; rejoined`);
      } else {
        feedback[cur.letter] += ' ' + l;
        warn(`${where} ${cur.letter}: explanation continued on a second line; rejoined`);
      }
    }
    if (options.length !== 4) die(`${where}: ${options.length} lettered options`);
    const starred = options.filter(o => o.stars);
    if (starred.length > 1) die(`${where}: ${starred.length} options starred`);
    if (starred.length) keySignals.push([`${starred[0].stars} marker`, starred[0].letter]);
    options = options.map(({ letter, text }) => ({ letter, text }));
  } else {
    layout = 'ALTERNATE';
    const fbIdx = rest.map((l, i) => (isFeedbackLine(l) ? i : -1)).filter(i => i >= 0);
    if (fbIdx.length !== 4) die(`${where}: ALTERNATE block has ${fbIdx.length} explanations`);
    // The option before the first explanation is exactly one line; everything above it is the
    // prompt. Later options are whatever lies between two explanations.
    promptLines = rest.slice(0, fbIdx[0] - 1);
    options = [];
    fbIdx.forEach((f, k) => {
      const from = k === 0 ? fbIdx[0] - 1 : fbIdx[k - 1] + 1;
      const optLines = rest.slice(from, f);
      if (optLines.length !== 1) warn(`${where} ${'ABCD'[k]}: option spans ${optLines.length} lines; joined`);
      if (!optLines.length) die(`${where}: explanation ${k + 1} has no option above it`);
      options.push({ letter: 'ABCD'[k], text: optLines.join(' ') });
      feedback['ABCD'[k]] = feedbackText(rest[f]);
    });
    const tail = rest.slice(fbIdx[3] + 1);
    if (tail.length) die(`${where}: text after the last explanation: "${tail[0].slice(0, 60)}"`);
  }

  // Key from the verdict words, then reconcile every signal.
  for (const o of options) {
    if (feedback[o.letter] === undefined) die(`${where}: no explanation for ${o.letter}`);
    const v = verdictOf(feedback[o.letter]);
    if (v === 'correct') keySignals.push(['"Correct" verdict', o.letter]);
  }
  const keys = [...new Set(keySignals.map(s => s[1]))];
  if (!keys.length) die(`${where}: no correct answer indicated anywhere`);
  if (keys.length > 1) die(`${where}: key signals disagree: ${keySignals.map(s => s.join('=')).join(', ')}`);

  if (!promptLines.length) die(`${where}: no prompt`);
  const prompt = promptLines.map((l, i) => (i === 0 ? l.replace(QNUM_RE, '') : l));
  if (prompt.length > 1) warn(`${where}: prompt is ${prompt.length} lines; the builder joins them into one`);
  for (const o of options) if (!o.text.trim()) die(`${where}: option ${o.letter} empty`);

  return { sourceNum: +head[1], layout, assets, prompt, options, correct: keys[0], feedback };
}

// ---------- one file ----------
function parseFile(name) {
  const ls = readLines(path.join(SRC, name, 'word', 'document.xml'));
  const nonEmpty = ls.filter(Boolean);
  const id = fileIdentity(name, nonEmpty[0], nonEmpty[1] || '');
  let s = ls.findIndex(l => START_RE.test(l));
  const firstQ = ls.findIndex(l => HEADER_RE.test(l));
  if (s < 0) {
    warn(`${name}: no "Importable content starts here" marker; questions read from "${ls[firstQ]}"`);
    s = firstQ - 1;
  }
  let e = ls.findIndex((l, i) => i > s && (END_RE.test(l) || /End of importable content/i.test(l)));
  if (e < 0) { warn(`${name}: no end marker; read to the end of the document`); e = ls.length; }
  const region = ls.slice(s + 1, e);

  const starts = region.map((l, i) => (HEADER_RE.test(l) ? i : -1)).filter(i => i >= 0);
  if (!starts.length) die(`${name}: no questions`);
  const pre = region.slice(0, starts[0]).filter(l => l && !RULE_RE.test(l));
  if (pre.length) die(`${name}: text before Question 1: "${pre[0].slice(0, 60)}"`);
  const questions = starts.map((st, k) => {
    const blk = region.slice(st, k + 1 < starts.length ? starts[k + 1] : region.length);
    return parseBlock(blk, `${name} Q${k + 1}`);
  });
  questions.forEach((q, i) => {
    if (q.sourceNum !== i + 1) warn(`${name}: question ${i + 1} is numbered ${q.sourceNum} in the source`);
    q.num = i + 1;
  });

  const settings = settingsOf(ls.slice(0, s + 1));
  if (settings.questions && +settings.questions !== questions.length)
    warn(`${name}: settings say ${settings.questions} questions, document has ${questions.length}`);
  return { file: name, ...id, settings, objectives: objectivesOf(ls, firstQ), questions };
}

// ---------- owner-requested corrections ----------
function applyFixes(quizzes) {
  const file = path.join(SP, 'ai-automation', 'fixes.json');
  if (!fs.existsSync(file)) return [];
  const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const log = [];
  const quiz = n => quizzes.find(q => q.file === n) || die(`fixes.json: no quiz ${n}`);
  const question = (n, k) => quiz(n).questions[k - 1] || die(`fixes.json: ${n} has no Q${k}`);
  const mark = (q, what) => { (q.fixes = q.fixes || []).push(what); };

  for (const f of fx.settings || []) {
    const qz = quiz(f.file);
    if ((qz.settings[f.field] ?? null) !== f.from)
      die(`fixes.json: ${f.file} ${f.field} is "${qz.settings[f.field]}", fix expects "${f.from}"`);
    qz.settings[f.field] = f.to;
    (qz.settingFixes = qz.settingFixes || []).push({ field: f.field, reason: f.reason });
    log.push(`${f.file}: ${f.field} set to "${f.to}" — ${f.reason}`);
  }
  for (const f of fx.optionText || []) {
    const q = question(f.file, f.q);
    const o = q.options.find(x => x.letter === f.letter);
    if (o.text.endsWith(f.append)) die(`fixes.json: ${f.file} Q${f.q} ${f.letter} already ends "${f.append}" — drop the fix`);
    o.text += f.append;
    mark(q, 'option:' + f.letter);
    log.push(`${f.file} Q${f.q} ${f.letter}: appended "${f.append}" — ${f.reason}`);
  }
  for (const f of fx.replaceQuestion || []) {
    const qz = quiz(f.file);
    const old = question(f.file, f.q);
    if (old.prompt.join(' ') !== f.expectPrompt)
      die(`fixes.json: ${f.file} Q${f.q} prompt is no longer the one the replacement was written for`);
    const nq = f.question;
    if (nq.options.length !== 4 || !nq.options.every((o, i) => o.letter === 'ABCD'[i]))
      die(`fixes.json: replacement for ${f.file} Q${f.q} needs options A-D`);
    for (const o of nq.options) if (!nq.feedback[o.letter]) die(`fixes.json: replacement ${f.file} Q${f.q} lacks feedback ${o.letter}`);
    qz.questions[f.q - 1] = {
      sourceNum: old.sourceNum, num: old.num, layout: 'REPLACED',
      assets: nq.assets.map(a => ({ ...a, lessonHint: null })),
      prompt: nq.prompt, options: nq.options, correct: nq.correct, feedback: nq.feedback,
      fixes: ['replaced'], replacedReason: f.reason,
    };
    log.push(`${f.file} Q${f.q}: question replaced — ${f.reason}`);
  }
  return log;
}

// ---------- lesson resolution ----------
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function resolveAssets(quizzes) {
  // title -> "module.lesson" of the practice quiz citing it MOST. A lesson's practice quiz
  // occasionally reuses an earlier lesson's question, asset and all (PQ-M1L3 Q4 is PQ-M1L1 Q5
  // verbatim), so a title can be cited from two lessons. The majority wins; a tie goes to the
  // earlier lesson, where the reused question came from. Every split vote is reported.
  const votes = new Map();
  for (const qz of quizzes.filter(q => q.kind === 'practice')) {
    for (const q of qz.questions) for (const a of q.assets) {
      const k = a.type + '|' + norm(a.title);
      if (!votes.has(k)) votes.set(k, new Map());
      const v = votes.get(k), at = qz.module + '.' + qz.lesson;
      v.set(at, (v.get(at) || 0) + 1);
    }
  }
  const index = new Map();
  for (const [k, v] of votes) {
    const ranked = [...v].sort((x, y) => y[1] - x[1] ||
      x[0].split('.').map(Number)[0] - y[0].split('.').map(Number)[0] ||
      x[0].split('.').map(Number)[1] - y[0].split('.').map(Number)[1]);
    index.set(k, new Set([ranked[0][0]]));
    if (ranked.length > 1)
      warn(`${k.replace('|', ' "')}" is cited by more than one lesson's practice quiz ` +
        `(${ranked.map(r => 'M' + r[0].replace('.', 'L') + '×' + r[1]).join(', ')}); placed in ` +
        `M${ranked[0][0].replace('.', 'L')}`);
  }
  const lookup = a => {
    const k = a.type + '|' + norm(a.title);
    if (index.has(k)) return [...index.get(k)];
    // A title cited with a qualifier dropped: "... Framework Summary" vs
    // "... Framework Summary for Business Audiences". Accept only an unambiguous prefix match.
    const hits = [...index.keys()].filter(x => x.startsWith(a.type + '|') &&
      (x.startsWith(k + ' ') || k.startsWith(x + ' ')));
    return hits.length === 1 ? [...index.get(hits[0])] : [];
  };

  const log = [];
  for (const qz of quizzes) for (const q of qz.questions) {
    const where = `${qz.file} Q${q.num}`;
    for (const a of q.assets) {
      let cands = lookup(a).filter(c => +c.split('.')[0] === qz.module || qz.kind === 'final');
      let how = 'practice-quiz index';
      if (a.lessonHint) {
        cands = [qz.module + '.' + a.lessonHint];
        how = 'stated "(Lesson n)"';
      } else if (qz.kind === 'practice' && (!cands.length || cands.length > 1 ||
                 cands[0] !== qz.module + '.' + qz.lesson)) {
        // A practice quiz's assets belong to its own lesson unless the index places the title
        // squarely in another one.
        if (cands.length === 1 && cands[0] !== qz.module + '.' + qz.lesson) {
          warn(`${where}: ${a.type} "${a.title}" is cited by the Lesson ${cands[0].split('.')[1]} ` +
               `practice quiz too; kept at that lesson`);
        } else {
          cands = [qz.module + '.' + qz.lesson];
          how = 'the quiz\'s own lesson';
        }
      }
      if (cands.length > 1) die(`${where}: ${a.type} "${a.title}" sits in several lessons: ${cands.join(', ')}`);
      if (cands.length === 1) {
        [a.module, a.lesson] = cands[0].split('.').map(Number);
        a.resolvedBy = how;
      }
    }
    // An asset no practice quiz cites takes the lesson of the asset it is paired with in the
    // same question — the video and its reading. Failing that, the module alone.
    const placed = q.assets.find(a => a.lesson);
    for (const a of q.assets.filter(x => !x.lesson)) {
      if (placed) {
        a.module = placed.module; a.lesson = placed.lesson; a.resolvedBy = `paired with ${placed.type} "${placed.title}"`;
      } else if (qz.kind !== 'final') {
        a.module = qz.module; a.lesson = null; a.resolvedBy = 'module only — no practice quiz cites it';
        warn(`${where}: ${a.type} "${a.title}" has no lesson; reference names the module only`);
      } else die(`${where}: ${a.type} "${a.title}" cannot be placed in any module`);
    }
    for (const a of q.assets) log.push(`${where}: ${a.type} "${a.title}" -> M${a.module}` +
      (a.lesson ? `L${a.lesson}` : '') + ` (${a.resolvedBy})`);
  }
  return log;
}

// ---------- run ----------
if (!fs.existsSync(SRC)) die(`missing ${SRC} — unzip the seventeen .docx files there, one folder each`);
const names = fs.readdirSync(SRC).filter(n => fs.existsSync(path.join(SRC, n, 'word', 'document.xml'))).sort();
if (!names.length) die(`no unzipped .docx folders under ${SRC}`);
const quizzes = names.map(parseFile);
const order = { practice: 0, graded: 1, final: 2 };
quizzes.sort((a, b) => a.module - b.module || order[a.kind] - order[b.kind] || (a.lesson || 0) - (b.lesson || 0));
const fixLog = applyFixes(quizzes);
// Missing end punctuation and mismatched quotes, after the owner's fixes — see lib-punctuation.js.
const punctLog = punctuate(quizzes);
const resolution = resolveAssets(quizzes);

// The same question verbatim in two quizzes is worth knowing before upload.
const seen = new Map();
for (const qz of quizzes) for (const q of qz.questions) {
  const k = norm(q.prompt.join(' '));
  if (seen.has(k) && seen.get(k).kind === qz.kind)
    warn(`${qz.file} Q${q.num} repeats ${seen.get(k).where} word for word`);
  else if (!seen.has(k)) seen.set(k, { where: `${qz.file} Q${q.num}`, kind: qz.kind });
}

if (report) {
  for (const qz of quizzes) {
    const lay = {};
    qz.questions.forEach(q => { lay[q.layout] = (lay[q.layout] || 0) + 1; });
    console.log(`${qz.file.padEnd(24)} ${qz.kind.padEnd(8)} M${qz.module}${qz.lesson ? 'L' + qz.lesson : '  '} ` +
      `${String(qz.questions.length).padStart(2)} q  ${JSON.stringify(lay)}  "${qz.title}"`);
  }
  console.log('\nFIXES APPLIED (work/ai-automation/fixes.json)');
  fixLog.forEach(r => console.log('  ' + r));
  console.log(`\nPUNCTUATION ADDED OR CORRECTED (${punctLog.length})`);
  punctLog.forEach(r => console.log('  ' + r));
  console.log('\nREFERENCES');
  resolution.forEach(r => console.log('  ' + r));
  console.log(`\n${warns.length} warning(s)`);
  warns.forEach(w => console.log('  WARN ' + w));
} else {
  warns.forEach(w => console.error('WARN ' + w));
  fixLog.forEach(r => console.error('FIX  ' + r));
  punctLog.forEach(r => console.error('PUNC ' + r));
  process.stdout.write(JSON.stringify(quizzes, null, 2) + '\n');
}

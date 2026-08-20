// Re-opens every generated .docx and checks it against quiz.json and outline.json.
//
//   node src/bridging-soft-skills-verify.js <outDir>
//
// Nothing here trusts the builder: the output is unzipped and re-read, so a check that passes
// is a statement about the file that will actually be uploaded.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'bridging-soft-skills';
const OUT = process.argv[2];
if (!OUT) { console.error('usage: bridging-soft-skills-verify.js <outDir>'); process.exit(2); }

const quizzes = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'quiz.json'), 'utf8'));
const { map: VIDEOS, meta: MMETA, course: COURSE } =
  JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'outline.json'), 'utf8'));

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const referLine = m => 'Refer to ' + m + ': ' + VIDEOS[m].video;

// Mirrors bridging-soft-skills-build.js. Kept in step by the filename check below: a builder
// that renamed its output would leave this verifier reporting a missing file, not a pass.
const fileOf = z => z.kind === 'graded'
  ? 'Coursera_Import_Module_' + z.module + '_Graded_Quiz_Bridging_Soft_Skills.docx'
  : 'Coursera_Import_Module_' + z.module + '_Lesson_' + z.lesson +
    '_Practice_Quiz_Bridging_Soft_Skills.docx';

const minutesOf = z => z.kind === 'graded'
  ? (COURSE.gradedMinutes['M' + z.module] || 20)
  : (COURSE.practiceMinutes['M' + z.module + 'L' + z.lesson] || 5);
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

let fail = 0;
const bad = m => { console.log('   FAIL: ' + m); fail++; };

// ---- template section skeleton, in order ----
const wantSections = [
  ['Title', null],
  ['Heading1', 'Getting started'],
  ['Heading1', 'Import Section'],
  ['Heading3', '----- Importable content starts here -----'],
  ['Heading3', '----- End of importable content -----'],
  ['Heading3', '****The following content is for your reference and will not be imported.****'],
  ['Heading1', 'Guide Section'],
  ['Heading2', 'Core Information'],
  ['Heading2', 'Assignment Title'],
  ['Heading2', 'Grading Settings'],
  ['Heading4', 'Grade to Save (Select with ‘*’)'],
  ['Heading4', 'Assignment Type (Select with ‘*’)'],
  ['Heading4', 'Time Estimate (hh:mm)'],
  ['Heading4', 'Passing Threshold'],
  ['Heading4', 'Feedback Type (Select with ‘*’)'],
  ['Heading4', 'Learner Grade Visibility (Select with ‘*’)'],
  ['Heading4', 'Learner Response Visibility (Select with ‘*’)'],
  ['Heading4', 'Maximum Number of Attempts'],
  ['Heading4', 'Time Limit Per Attempt (hh:mm)'],
  ['Heading4', 'Maximum Number of Submissions Per Timed Attempt'],
  ['Heading4', 'Plagiarism Detection (Select with ‘*’)'],
  ['Heading2', 'Instructions for Learners'],
  ['Heading4', 'Learning objectives'],
  ['Heading4', 'Instructions overview'],
  ['Heading4', 'Review Criteria Summary'],
  ['Heading2', 'Instructions for Graders'],
  ['Heading4', 'Instructions (not shown to learners)'],
  ['Heading4', 'Assignment Rubrics'],
  ['Heading2', 'Working area for question design'],
];

const START = '----- Importable content starts here -----';
const END = '----- End of importable content -----';

const FMT = [[/<w:b\b/, 'bold'], [/<w:i\b/, 'italic'], [/<w:u\b/, 'underline'],
             [/<w:strike\b/, 'strikethrough'], [/<w:color\b/, 'font colour'],
             [/<w:highlight\b/, 'highlight'], [/<w:smallCaps\b/, 'small caps'],
             [/<w:caps\b/, 'all caps'], [/<w:vertAlign\b/, 'super/subscript']];

let totalQ = 0, totalFb = 0;

for (const z of quizzes) {
  const name = fileOf(z);
  const file = path.join(OUT, name);
  const scope = z.kind === 'graded'
    ? 'Module ' + z.module + ' graded'
    : 'Module ' + z.module + ' Lesson ' + z.lesson + ' practice';
  console.log('\n=== ' + scope + ': ' + name + ' ===');
  if (!fs.existsSync(file)) { bad('output file does not exist'); continue; }

  const ex = path.join(SP, 'vfy');
  fs.rmSync(ex, { recursive: true, force: true });
  execFileSync('unzip', ['-o', '-q', file, '-d', ex]);

  for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml',
                   'word/styles.xml', 'word/_rels/document.xml.rels']) {
    if (!fs.existsSync(path.join(ex, p))) bad('missing package part ' + p);
  }
  const ct = fs.readFileSync(path.join(ex, '[Content_Types].xml'), 'utf8');
  const rels = fs.readFileSync(path.join(ex, 'word/_rels/document.xml.rels'), 'utf8');
  if (/comments\.xml/.test(ct) || /comments\.xml/.test(rels)) bad('dangling comments.xml reference');

  // paragraphs -> lines (<w:br/> becomes a newline inside the same line)
  const xml = fs.readFileSync(path.join(ex, 'word/document.xml'), 'utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const lines = [];
  const xmls = [];
  const heads = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm;
  while ((pm = pRe.exec(body)) !== null) {
    let t = '';
    const tok = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g;
    let tm;
    while ((tm = tok.exec(pm[0])) !== null) t += tm[1] !== undefined ? dec(tm[1]) : '\n';
    lines.push(t.trim());
    xmls.push(pm[0]);
    const st = (pm[0].match(/<w:pStyle w:val="(Title|Heading\d)"\/>/) || [])[1];
    if (st && t.trim()) heads.push({ style: st, text: t.trim() });
  }

  let cursor = 0;
  for (const [style, text] of wantSections) {
    const at = heads.findIndex((h, i) => i >= cursor && h.style === style &&
      (text === null || h.text === text));
    if (at < 0) bad('template section missing or out of order: <' + style + '> ' + (text || '(title)'));
    else cursor = at + 1;
  }

  // ---- hyperlinks must resolve to real relationships ----
  const relIds = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map(m => m[1]));
  const used = [...xml.matchAll(/<w:hyperlink r:id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(used).size < 8) {
    bad('only ' + new Set(used).size + ' distinct hyperlinks — template guidance links are missing');
  }
  for (const id of new Set(used)) if (!relIds.has(id)) bad('hyperlink points at missing rel ' + id);

  lines.forEach((l, i) => {
    if (/\[object Object\]|undefined|NaN/.test(l)) {
      bad('stringified value leaked into text at line ' + i + ': "' + l.slice(0, 70) + '"');
    }
  });

  const s = lines.indexOf(START);
  const e = lines.indexOf(END);
  if (s < 0 || e < 0 || e <= s) { bad('import markers missing or out of order'); continue; }
  if (lines.filter(l => l === START).length !== 1) bad('start marker is not unique');
  if (lines.filter(l => l === END).length !== 1) bad('end marker is not unique');
  lines.forEach((l, i) => {
    if (i === s || i === e) return;
    if (/importable content starts here|end of importable content/i.test(l)) {
      bad('prose collides with a marker string at line ' + i + ': "' + l.slice(0, 70) + '"');
    }
  });

  const secPairs = lines.slice(s + 1, e).map((l, i) => ({ l, x: xmls[s + 1 + i] })).filter(p => p.l);
  const sec = secPairs.map(p => p.l);

  // Every logical line must be its own paragraph, exactly as the importer expects.
  secPairs.forEach((p, i) => {
    if (/<w:br\b/.test(p.x)) bad('line break inside import section at line ' + i + ': "' + p.l.slice(0, 60) + '"');
    for (const [re, nm] of FMT) {
      if (re.test(p.x)) bad(nm + ' formatting inside import section at line ' + i + ': "' + p.l.slice(0, 60) + '"');
    }
  });

  const idx = [];
  sec.forEach((l, i) => { if (/^Question \d+\b/.test(l)) idx.push(i); });
  if (idx.length !== z.questions.length) {
    bad('expected ' + z.questions.length + ' questions, found ' + idx.length);
  }

  sec.forEach(l => {
    if (/Mapped to:|✅|Correct Answer:|Explanation for/.test(l)) {
      bad('source metadata leaked into import section: ' + l.slice(0, 60));
    }
  });

  let refCount = 0;
  idx.forEach((start, k) => {
    const end = k + 1 < idx.length ? idx[k + 1] : sec.length;
    const blk = sec.slice(start, end);
    const src = z.questions[k];
    const tag = 'Q' + src.num;
    const wantRef = referLine(src.mapped);

    if (blk[0] !== 'Question ' + src.num + ' - multiple choice, shuffle') {
      bad(tag + ' header wrong: "' + blk[0] + '"');
    }

    const opts = blk.filter(l => /^\*?[A-D]:\s/.test(l));
    const fbs = blk.filter(l => /^Feedback:\s/.test(l));
    if (opts.length !== 4) bad(tag + ' has ' + opts.length + ' options');
    if (fbs.length !== 4) bad(tag + ' has ' + fbs.length + ' feedback blocks');

    const starred = opts.filter(l => l.startsWith('*'));
    if (starred.length !== 1) bad(tag + ' has ' + starred.length + ' starred answers');
    else if (starred[0][1] !== src.correct) {
      bad(tag + ' starred ' + starred[0][1] + ', source says ' + src.correct);
    }

    src.options.forEach((o, oi) => {
      const wantOpt = (o.letter === src.correct ? '*' : '') + o.letter + ': ' + o.text;
      if (opts[oi] !== wantOpt) {
        bad(tag + ' option ' + o.letter + ' mismatch\n      got:  ' + opts[oi] + '\n      want: ' + wantOpt);
      }

      // required shape: ONE line — "Feedback: <explanation> (Refer to M1L1V1: ...)"
      const wantFb = 'Feedback: ' + src.feedback[o.letter] + ' (' + wantRef + ')';
      if (fbs[oi] !== wantFb) {
        bad(tag + ' feedback ' + o.letter + ' mismatch\n      got:  ' + JSON.stringify(fbs[oi]) +
            '\n      want: ' + JSON.stringify(wantFb));
      } else {
        if (fbs[oi].includes('\n')) bad(tag + ' feedback ' + o.letter + ': contains a line break — must be one line');
        if (!fbs[oi].endsWith(' (' + wantRef + ')')) {
          bad(tag + ' feedback ' + o.letter + ': bracketed reference not at end, separated by one space');
        }
        if (!/^Refer to M\d+L\d+V\d+: \S/.test(wantRef)) {
          bad(tag + ' feedback ' + o.letter + ': bad reference line "' + wantRef + '"');
        }
        const opens = (fbs[oi].match(/\(/g) || []).length;
        const closes = (fbs[oi].match(/\)/g) || []).length;
        if (opens !== closes) {
          bad(tag + ' feedback ' + o.letter + ': unbalanced brackets (' + opens + ' open, ' + closes + ' close)');
        }
        // A video title may itself contain brackets, so require the wrapper, not the absence
        // of nesting.
        if (!/\(Refer to M\d+L\d+V\d+: .+\)$/.test(fbs[oi])) {
          bad(tag + ' feedback ' + o.letter + ': reference is not wrapped in brackets at the end');
        }
        const expl = fbs[oi].replace(/^Feedback:\s*/, '');
        if (!expl || !/^[A-Z0-9"“(]/.test(expl)) {
          bad(tag + ' feedback ' + o.letter + ': explanation starts oddly -> "' + expl.slice(0, 50) + '"');
        }
        refCount++;
      }
    });

    // The prompt is exactly one paragraph, one plain run, byte-identical to quiz.json.
    const firstOpt = blk.findIndex(l => /^\*?[A-D]:\s/.test(l));
    const gotPrompt = blk.slice(1, firstOpt);
    if (gotPrompt.length !== 1) bad(tag + ' prompt has ' + gotPrompt.length + ' paragraphs, expected 1');
    if (gotPrompt[0] !== src.prompt) {
      bad(tag + ' prompt text mismatch\n      got:  ' + JSON.stringify(gotPrompt[0]) +
          '\n      want: ' + JSON.stringify(src.prompt));
    }
    if ((gotPrompt[0] || '').includes('\n')) bad(tag + ' prompt contains an intra-paragraph line break');
    // A prompt opening "Label:" is read by the importer as an answer option.
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(gotPrompt[0] || '')) {
      bad(tag + ' prompt starts with a label-like token: "' + gotPrompt[0].slice(0, 40) + '"');
    }
    if (/^Scenario\b/i.test(gotPrompt[0] || '')) bad(tag + ' prompt still carries the Scenario label');
    const px = (secPairs[start + 1] || {}).x || '';
    const nRuns = (px.match(/<w:r>/g) || []).length;
    if (nRuns !== 1) bad(tag + ' prompt paragraph has ' + nRuns + ' runs — must be exactly 1');

    for (let i = 0; i < blk.length - 1; i++) {
      if (/^\*?[A-D]:\s/.test(blk[i]) && !/^Feedback:\s/.test(blk[i + 1])) {
        bad(tag + ' option not followed by Feedback: ' + blk[i].slice(0, 40));
      }
    }

    // Exact line grammar the importer accepts: header, one prompt line, then option/feedback
    // pairs. Any extra or unrecognised line is what triggers "need to be in the correct format".
    const shape = blk.map(l =>
      /^Question \d+ - /.test(l) ? 'H'
      : /^\*?[A-D]:\s/.test(l) ? 'O'
      : /^Feedback:\s/.test(l) ? 'F'
      : 'P').join('');
    const wantShape = 'HP' + 'OF'.repeat(src.options.length);
    if (shape !== wantShape) {
      bad(tag + ' line grammar is ' + shape + ', expected ' + wantShape +
          '\n      offending lines: ' + JSON.stringify(blk.filter((l, i) =>
            shape[i] === 'P' && i !== 1).map(l => l.slice(0, 60))));
    }
  });

  // ---- guide section: the values that distinguish a practice quiz from a graded one ----
  const guide = lines.slice(e);
  const guideText = guide.join('\n');
  if (!/Guide Section/.test(guideText)) bad('Guide Section missing');
  if (!/will not be imported/.test(guideText)) bad('reference disclaimer missing');
  if (lines.slice(0, s).some(l => /^Question \d+ - /.test(l))) bad('question found before start marker');

  const after = h => {
    const i = guide.findIndex(l => l === h);
    return i < 0 ? null : guide.slice(i + 1).find(l => l && !/^(Choose|Enter|Use if|Feedback will|This is a practice|FOR DEGREE|Learner grade)/.test(l));
  };
  const wantThreshold = z.kind === 'graded' ? '80%' : '0%';
  const gotThreshold = after('Passing Threshold');
  if (gotThreshold !== wantThreshold) {
    bad('Passing Threshold is "' + gotThreshold + '", expected "' + wantThreshold + '" for a ' + z.kind + ' quiz');
  }
  const wantTime = hhmm(minutesOf(z));
  const gotTime = after('Time Estimate (hh:mm)');
  if (gotTime !== wantTime) {
    bad('Time Estimate is "' + gotTime + '", the outline budgets "' + wantTime + '"');
  }
  // The learner-facing wording has to say which kind of quiz this is; a practice quiz that
  // claims to be graded is worse than one with the wrong threshold.
  if (z.kind === 'practice') {
    if (!/practice quiz/i.test(guideText)) bad('practice quiz never described as ungraded practice');
    if (/You need a score of 80% or higher to pass/.test(guideText)) {
      bad('practice quiz carries the graded pass-mark wording');
    }
  } else if (!/graded quiz/i.test(guideText)) {
    bad('graded quiz never described as graded');
  }

  // Objectives are the quiz's own scope: a module quiz lists the module's, a practice quiz its
  // lesson's.
  const m = MMETA['M' + z.module];
  const wantObjs = z.kind === 'graded' ? m.objectives : m.lessons[z.lesson].objectives;
  for (const lo of wantObjs) {
    if (!guide.includes(lo)) bad('learning objective missing from the guide: "' + lo.slice(0, 55) + '"');
  }

  totalQ += idx.length;
  totalFb += refCount;
  console.log('   ' + idx.length + ' questions | ' + refCount + ' feedback blocks with reference line | ' +
    wantSections.length + ' template sections in order | ' + new Set(used).size + ' live hyperlinks | ' +
    wantObjs.length + ' objectives | ' + z.kind + ' settings OK | package OK');
  fs.rmSync(ex, { recursive: true, force: true });
}

const g = quizzes.filter(z => z.kind === 'graded').length;
console.log(fail === 0
  ? '\n✅ ALL CHECKS PASSED — ' + quizzes.length + ' files (' + g + ' graded, ' +
    (quizzes.length - g) + ' practice), ' + totalQ + ' questions, ' + totalFb +
    ' feedback blocks, references verified against the outline.'
  : '\n❌ ' + fail + ' CHECK(S) FAILED');
process.exit(fail === 0 ? 0 : 1);

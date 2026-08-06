const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'genai-appdev', 'quiz.json'), 'utf8'));
const { map: VIDEOS } = JSON.parse(fs.readFileSync(path.join(SP, 'genai-appdev', 'outline.json'), 'utf8'));
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Mirrors build.js: removes the verdict word, its punctuation and exactly ONE following
// space. All other authored spacing is preserved verbatim.
const stripVerdict = fb => String(fb).replace(/^(Correct|Incorrect)[.:,!]? /, '');

const referLine = m => {
  const v = VIDEOS[m];
  return `Refer to ${m}: ${v.video}`;
};

let fail = 0;
const bad = m => { console.log('   FAIL: ' + m); fail++; };

for (const mo of mods) {
  const file = path.join(OUT, `Coursera_Import_Module_${mo.num}_Graded_Quiz_GenAI_AppDev.docx`);
  console.log(`\n=== Module ${mo.num}: ${path.basename(file)} ===`);

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
  const xmls = [];    // raw paragraph XML, parallel to `lines`
  const heads = [];   // {style, text} for styled headings, in document order
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
  let cursor = 0;
  for (const [style, text] of wantSections) {
    const at = heads.findIndex((h, i) => i >= cursor && h.style === style &&
      (text === null || h.text === text));
    if (at < 0) bad(`template section missing or out of order: <${style}> ${text || '(title)'}`);
    else cursor = at + 1;
  }

  // ---- hyperlinks must resolve to real relationships ----
  const relIds = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map(m => m[1]));
  const used = [...xml.matchAll(/<w:hyperlink r:id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(used).size < 8)
    bad(`only ${new Set(used).size} distinct hyperlinks — template guidance links are missing`);
  for (const id of new Set(used)) if (!relIds.has(id)) bad('hyperlink points at missing rel ' + id);

  // any object/array that leaked into the text instead of being rendered as runs
  // Catch stringification artefacts, but not the ordinary English words: an option may
  // legitimately read "Keep requirements flexible and undefined".
  lines.forEach((l, i) => {
    const t = l.trim();
    if (/\[object Object\]/.test(t) || /^(undefined|NaN)$/.test(t) ||
        /:\s*(undefined|NaN)\s*$/.test(t) || /\((undefined|NaN)\)/.test(t))
      bad(`stringified value leaked into text at line ${i}: "${t.slice(0, 70)}"`);
  });

  // Match the marker paragraphs exactly. Anything else that merely mentions the phrase
  // (e.g. guidance prose) must NOT look like a marker to the importer.
  const START = '----- Importable content starts here -----';
  const END = '----- End of importable content -----';
  const s = lines.indexOf(START);
  const e = lines.indexOf(END);
  if (s < 0 || e < 0 || e <= s) { bad('import markers missing or out of order'); continue; }
  if (lines.filter(l => l === START).length !== 1) bad('start marker is not unique');
  if (lines.filter(l => l === END).length !== 1) bad('end marker is not unique');
  lines.forEach((l, i) => {
    if (i === s || i === e) return;
    if (/importable content starts here|end of importable content/i.test(l))
      bad(`prose collides with a marker string at line ${i}: "${l.slice(0, 70)}"`);
  });
  const secPairs = lines.slice(s + 1, e)
    .map((l, i) => ({ l, x: xmls[s + 1 + i] }))
    .filter(p => p.l);
  const sec = secPairs.map(p => p.l);

  // Nothing inside the importable region may carry an intra-paragraph line break:
  // every logical line must be its own paragraph, exactly as the importer expects.
  secPairs.forEach((p, i) => {
    if (/<w:br\b/.test(p.x)) bad(`line break inside import section at line ${i}: "${p.l.slice(0, 60)}"`);
  });

  // All quiz content is plain text: no bold, italic, underline, strike, colour or
  // highlight on any run inside the importable region.
  const FMT = [[/<w:b\b/, 'bold'], [/<w:i\b/, 'italic'], [/<w:u\b/, 'underline'],
               [/<w:strike\b/, 'strikethrough'], [/<w:color\b/, 'font colour'],
               [/<w:highlight\b/, 'highlight'], [/<w:smallCaps\b/, 'small caps'],
               [/<w:caps\b/, 'all caps'], [/<w:vertAlign\b/, 'super/subscript']];
  secPairs.forEach((p, i) => {
    for (const [re, name] of FMT) {
      if (re.test(p.x)) bad(`${name} formatting inside import section at line ${i}: "${p.l.slice(0, 60)}"`);
    }
  });

  const idx = [];
  sec.forEach((l, i) => { if (/^Question \d+\b/.test(l)) idx.push(i); });
  if (idx.length !== mo.questions.length)
    bad(`expected ${mo.questions.length} questions, found ${idx.length}`);

  sec.forEach(l => {
    if (/Mapped to:|Bloom's:|✅|Correct Answer:/.test(l))
      bad('metadata leaked into import section: ' + l.slice(0, 60));
  });

  let refCount = 0;
  idx.forEach((start, k) => {
    const end = k + 1 < idx.length ? idx[k + 1] : sec.length;
    const blk = sec.slice(start, end);
    const src = mo.questions[k];
    const tag = `Q${src.num}`;
    const wantRef = referLine(src.mapped);

    if (blk[0] !== `Question ${src.num} - multiple choice, shuffle`)
      bad(`${tag} header wrong: "${blk[0]}"`);

    const opts = blk.filter(l => /^\*?[A-D]:\s/.test(l));
    const fbs = blk.filter(l => /^Feedback:\s/.test(l));
    if (opts.length !== 4) bad(`${tag} has ${opts.length} options`);
    if (fbs.length !== 4) bad(`${tag} has ${fbs.length} feedback blocks`);

    const starred = opts.filter(l => l.startsWith('*'));
    if (starred.length !== 1) bad(`${tag} has ${starred.length} starred answers`);
    else if (starred[0][1] !== src.correct)
      bad(`${tag} starred ${starred[0][1]}, source says ${src.correct}`);

    src.options.forEach((o, oi) => {
      const wantOpt = (o.letter === src.correct ? '*' : '') + o.letter + ': ' + o.text;
      if (opts[oi] !== wantOpt)
        bad(`${tag} option ${o.letter} mismatch\n      got:  ${opts[oi]}\n      want: ${wantOpt}`);

      // required shape: ONE line — "Feedback: <explanation> (Refer to M1L1V1: ...)"
      const wantFb = 'Feedback: ' + stripVerdict(src.feedback[o.letter]) + ' (' + wantRef + ')';
      if (fbs[oi] !== wantFb) {
        bad(`${tag} feedback ${o.letter} mismatch\n      got:  ${JSON.stringify(fbs[oi])}\n      want: ${JSON.stringify(wantFb)}`);
      } else {
        if (fbs[oi].includes('\n'))
          bad(`${tag} feedback ${o.letter}: contains a line break — must be one line`);
        if (!fbs[oi].endsWith(' (' + wantRef + ')'))
          bad(`${tag} feedback ${o.letter}: bracketed reference not at end, separated by one space`);
        if (!/^Refer to M\d+L\d+V\d+: \S/.test(wantRef))
          bad(`${tag} feedback ${o.letter}: bad reference line "${wantRef}"`);
        // brackets must be balanced and the reference fully enclosed
        const opens = (fbs[oi].match(/\(/g) || []).length;
        const closes = (fbs[oi].match(/\)/g) || []).length;
        if (opens !== closes)
          bad(`${tag} feedback ${o.letter}: unbalanced brackets (${opens} open, ${closes} close)`);
        // A video title may itself contain brackets (e.g. "... Analyses (JHA)"), so the
        // wrapper may legitimately nest. Require the wrapper, not the absence of nesting.
        if (!/\(Refer to M\d+L\d+V\d+: .+\)$/.test(fbs[oi]))
          bad(`${tag} feedback ${o.letter}: reference is not wrapped in brackets at the end`);
        // no leftover verdict word at the start of the explanation
        if (/^Feedback:\s*(Correct|Incorrect)\b/i.test(fbs[oi]))
          bad(`${tag} feedback ${o.letter}: verdict word still present -> "${fbs[oi].slice(0, 50)}"`);
        // explanation must not have been left dangling by the strip
        const expl = fbs[oi].replace(/^Feedback:\s*/, '');
        if (!expl || !/^[A-Z0-9"“(]/.test(expl))
          bad(`${tag} feedback ${o.letter}: explanation starts oddly -> "${expl.slice(0, 50)}"`);
        refCount++;
      }
    });

    // Prompt keeps the source's paragraph split; only the "Scenario:" label is dropped.
    const firstOpt = blk.findIndex(l => /^\*?[A-D]:\s/.test(l));
    const gotPrompt = blk.slice(1, firstOpt).map(p => p.replace(/\s+/g, ' ').trim());
    const wantParas = (Array.isArray(src.prompt) ? src.prompt : [src.prompt])
      .map((l, i) => (i === 0 ? l.replace(/^\s*Scenario\s*:\s*/i, '') : l).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (gotPrompt.length !== wantParas.length)
      bad(`${tag} prompt has ${gotPrompt.length} paragraphs, source has ${wantParas.length}`);
    if (gotPrompt.some(p => p.includes('\n')))
      bad(`${tag} prompt contains an intra-paragraph line break`);
    if (JSON.stringify(gotPrompt) !== JSON.stringify(wantParas))
      bad(`${tag} prompt text mismatch\n      got:  ${JSON.stringify(gotPrompt)}\n      want: ${JSON.stringify(wantParas)}`);

    // No prompt line may begin "Label:" — the importer reads that as an answer option.
    gotPrompt.forEach((p, i) => {
      if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(p))
        bad(`${tag} prompt paragraph ${i + 1} starts with a label-like token: "${p.slice(0, 40)}"`);
      if (/^\s|\s$/.test(blk[1 + i] || ''))
        bad(`${tag} prompt paragraph ${i + 1} has stray leading/trailing whitespace`);
    });

    // Each prompt paragraph is a single plain run.
    gotPrompt.forEach((p, i) => {
      const px = (secPairs[start + 1 + i] || {}).x || '';
      const nRuns = (px.match(/<w:r>/g) || []).length;
      if (nRuns !== 1) bad(`${tag} prompt paragraph ${i + 1} has ${nRuns} runs — must be exactly 1`);
    });

    for (let i = 0; i < blk.length - 1; i++) {
      if (/^\*?[A-D]:\s/.test(blk[i]) && !/^Feedback:\s/.test(blk[i + 1]))
        bad(`${tag} option not followed by Feedback: ${blk[i].slice(0, 40)}`);
    }

    // Exact line grammar the importer accepts: header, prompt, then option/feedback pairs.
    // Any extra or unrecognised line is what triggers "need to be in the correct format".
    const shape = blk.map(l =>
      /^Question \d+ - /.test(l) ? 'H'
      : /^\*?[A-D]:\s/.test(l) ? 'O'
      : /^Feedback:\s/.test(l) ? 'F'
      : 'P');
    const nPromptParas = (Array.isArray(src.prompt) ? src.prompt : [src.prompt])
      .map((l, i) => (i === 0 ? l.replace(/^\s*Scenario\s*:\s*/i, '') : l).trim())
      .filter(Boolean).length;
    const wantShape = 'H' + 'P'.repeat(nPromptParas) + 'OF'.repeat(src.options.length);
    if (shape.join('') !== wantShape)
      bad(`${tag} line grammar is ${shape.join('')}, expected ${wantShape}` +
          `\n      offending lines: ${JSON.stringify(blk.filter((l, i) =>
            shape[i] === 'P' && i !== 1).map(l => l.slice(0, 60)))}`);
  });

  const guide = lines.slice(e).join('\n');
  if (!/Guide Section/.test(guide)) bad('Guide Section missing');
  if (!/will not be imported/.test(guide)) bad('reference disclaimer missing');
  if (lines.slice(0, s).some(l => /^Question \d+ - /.test(l))) bad('question found before start marker');

  console.log(`   ${idx.length} questions | ${refCount} feedback blocks with reference line | ` +
    `${wantSections.length} template sections in order | ${new Set(used).size} live hyperlinks | package OK`);
  fs.rmSync(ex, { recursive: true, force: true });
}

console.log(fail === 0
  ? `\n✅ ALL CHECKS PASSED — ${mods.length} files, ` +
    `${mods.reduce((a, m) => a + m.questions.length, 0)} questions, ` +
    `${mods.reduce((a, m) => a + m.questions.reduce((b, q) => b + q.options.length, 0), 0)} ` +
    'feedback blocks, references verified against the outline.'
  : `\n❌ ${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);

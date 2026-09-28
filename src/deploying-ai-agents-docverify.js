// Verifier for the Deploying and Orchestrating AI Agents import documents. Shared by the
// graded quizzes, the lesson practice quizzes and the final exam, because all three are the
// same document and a check that only runs on one family is a check that does not run.
//
// This reads the BUILT .docx back out of its zip and compares it against the parsed JSON. It
// deliberately re-derives the expected feedback line from the JSON rather than trusting the
// builder, so a mistake in the builder shows up here as a mismatch instead of being copied
// into both. That has already caught, on other courses, a reference format that changed in the
// builder but not in the verifier, and a module heading swept into the previous question's
// feedback.
//
// THE REFERENCE SHAPE CHECKED HERE is this course's, and it is wider than every earlier one:
//
//     <explanation> Refer to Module 1 Lesson 1 Video: <title>
//     <explanation> Refer to Module 1 Lesson 1 Reading: FAQ: <question>
//     <explanation> Refer to Module 1 Lesson 1 Video: <title>; Module 1 Lesson 1 Reading: <title>
//
// Every kind reads the same way — "Video:", "Reading:", "Lab:" — with no number, because the
// source cites readings, labs, FAQs and discussion prompts directly for 28 of the 110
// questions and the title is what identifies the item. A question citing two assets lists
// both, separated by "; ". The builder and this file must change together.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { referSuffix, referText, refString } = require('./deploying-ai-agents-lib');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// The asset kinds the outline parser can label a reference with. Anything outside this set in
// a built document means the label came from somewhere it should not have.
//
// Whether "Video" carries a number is a per-document decision — the GitHub format numbers it
// ("Video 1"), the form this course shipped with does not ("Video"). So the pattern is built
// per document from its own style, and a number appearing where the document is unnumbered
// fails, as does a number missing where it is numbered. Listed longest-first so "Demo Video"
// and "Day-in-the-Life Video" are not shadowed by the bare "Video".
//
// "FAQ" is NOT in either list, and must not be. An FAQ is published as a Reading, so its
// reference reads "Reading: FAQ: <question>" — the label is the item type the learner sees and
// the designation lives in the title. A bare "FAQ:" label is a regression, and leaving it out
// here is what catches it.
const kindLabel = numberVideos => 'Day-in-the-Life Video|Downloadable Resource|Cumulative Project|'
  + 'Discussion Prompt|Expert Viewpoint|Practice Quiz|SME Interview|Graded Quiz|Demo Video|'
  + `Final Exam|Reading|Video${numberVideos ? ' \\d+' : ''}|Lab`;
const oneRef = st => new RegExp(`^Module \\d+ Lesson \\d+ (?:${kindLabel(st.numberVideos)}): \\S`);
// How the reference closes the feedback line, one pattern per layout. Which layout a given
// document uses is decided in deploying-ai-agents-lib.js and is checked here, not assumed —
// the point is that a document silently switching form fails.
//
//   own-line   … explanation.⏎Refer to Module 1 Lesson 3 Video 1: <title>
//   bracketed  … explanation. (Refer to Module 1 Lesson 3 Video: <title>)
//
// The own-line pattern requires the fold's newline before "Refer to" and ends on a character
// that is neither a bracket nor whitespace, so the parenthesised form cannot satisfy it, and
// vice versa.
const REF_TAIL = st => {
  const K = kindLabel(st.numberVideos);
  return st.layout === 'own-line'
    ? new RegExp(`\\nRefer to Module \\d+ Lesson \\d+ (?:${K}): .*\\S$`)
    : new RegExp(`\\(Refer to Module \\d+ Lesson \\d+ (?:${K}): .+\\)$`);
};

// "undefined" is an English word as well as a JavaScript value. Only the value form — standing
// alone in a slot where a value was meant to be interpolated — is a leak.
const LEAKED_UNDEF = /(?:^|[:(]\s*|\s)undefined(?=\s*(?:$|[):,(]))/;

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

const FMT = [[/<w:b\b/, 'bold'], [/<w:i\b/, 'italic'], [/<w:u\b/, 'underline'],
             [/<w:strike\b/, 'strikethrough'], [/<w:color\b/, 'font colour'],
             [/<w:highlight\b/, 'highlight'], [/<w:smallCaps\b/, 'small caps'],
             [/<w:caps\b/, 'all caps'], [/<w:vertAlign\b/, 'super/subscript']];

// Verifies every document in `files`: [{file, quiz, label}]. Returns the failure count.
function verifyAll(OUT, files, summaryNoun) {
  if (!OUT) {
    console.error('usage: node <verifier>.js <directory holding the built documents>');
    process.exit(1);
  }
  let fail = 0;
  const atRisk = [];
  const bad = m => { console.log('   FAIL: ' + m); fail++; };

  for (const { file, quiz, label, refStyle } of files) {
    const full = path.join(OUT, file);
    console.log(`\n=== ${label}: ${file} ===`);
    if (!fs.existsSync(full)) { bad('file does not exist'); continue; }
    if (!refStyle || (refStyle.layout !== 'own-line' && refStyle.layout !== 'bracketed')) {
      bad(`no reference style given for this document (got ${JSON.stringify(refStyle)})`);
      continue;
    }
    const layout = refStyle.layout;

    const ex = path.join(SP, 'vfy');
    fs.rmSync(ex, { recursive: true, force: true });
    execFileSync('unzip', ['-o', '-q', full, '-d', ex]);

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
      if (at < 0) bad(`template section missing or out of order: <${style}> ${text || '(title)'}`);
      else cursor = at + 1;
    }

    const relIds = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map(m => m[1]));
    const used = [...xml.matchAll(/<w:hyperlink r:id="([^"]+)"/g)].map(m => m[1]);
    if (new Set(used).size < 8)
      bad(`only ${new Set(used).size} distinct hyperlinks — template guidance links are missing`);
    for (const id of new Set(used)) if (!relIds.has(id)) bad('hyperlink points at missing rel ' + id);

    lines.forEach((l, i) => {
      if (/\[object Object\]|\bNaN\b/.test(l) || LEAKED_UNDEF.test(l))
        bad(`stringified value leaked into text at line ${i}: "${l.slice(0, 70)}"`);
    });

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

    // In the own-line layout each "Refer to Module ..." is its own paragraph and must sit
    // IMMEDIATELY after its Feedback: paragraph — a blank paragraph between them would end the
    // feedback as far as the importer is concerned. Fold each such pair into one logical line
    // joined by SEP, so every per-option check below reads one feedback line in either layout.
    // A reference paragraph anywhere else is left unfolded, and the grammar check rejects it.
    const SEP = layout === 'own-line' ? '\n' : '';
    const rawPairs = lines.slice(s + 1, e).map((l, i) => ({ l, x: xmls[s + 1 + i] }));
    const folded = [];
    rawPairs.forEach(p => {
      const prev = folded[folded.length - 1];
      if (layout === 'own-line' && /^Refer to Module /.test(p.l)
          && prev && /^Feedback: /.test(prev.l)) {
        if (!/w:after="0"/.test(p.x))
          bad(`reference paragraph is not zero-spaced: "${p.l.slice(0, 60)}"`);
        prev.l += SEP + p.l;
        prev.x += p.x;
      } else folded.push({ ...p });
    });
    const secPairs = folded.filter(p => p.l);
    const sec = secPairs.map(p => p.l);

    secPairs.forEach((p, i) => {
      if (/<w:br\b/.test(p.x)) bad(`line break inside import section at line ${i}: "${p.l.slice(0, 60)}"`);
      for (const [re, name] of FMT) {
        if (re.test(p.x)) bad(`${name} formatting inside import section at line ${i}: "${p.l.slice(0, 60)}"`);
      }
    });

    const idx = [];
    sec.forEach((l, i) => { if (/^Question \d+\b/.test(l)) idx.push(i); });
    if (idx.length !== quiz.questions.length)
      bad(`expected ${quiz.questions.length} questions, found ${idx.length}`);

    // Everything the source carried that must NOT reach Coursera: the Asset line is working
    // metadata, and the verdict words are the answer key.
    sec.forEach(l => {
      if (/^Asset:|Mapped to:|Bloom's:|✅|Correct Answer:|Grade setting/i.test(l))
        bad('metadata leaked into import section: ' + l.slice(0, 60));
    });

    let refCount = 0;
    idx.forEach((start, k) => {
      const end = k + 1 < idx.length ? idx[k + 1] : sec.length;
      const blk = sec.slice(start, end);
      const src = quiz.questions[k];
      if (!src) { bad(`question block ${k + 1} has no counterpart in the parsed source`); return; }
      const tag = `Q${src.num}`;
      const wantRefs = src.refs.map(r => refString(r, refStyle.numberVideos));
      // Built from the same helpers the builder calls, with the same per-document style, so
      // the two cannot drift on the layout. Everything else about the line is still re-derived
      // here from the parsed JSON rather than trusted from the builder. In the own-line layout
      // the separator is the fold's newline; in the bracketed one it is inside referSuffix.
      const refText = referText(src.refs, refStyle.numberVideos);
      const refer = layout === 'own-line'
        ? (refText ? SEP + refText : '')
        : referSuffix(src.refs, refStyle);

      if (blk[0] !== `Question ${src.num} - multiple choice, shuffle`)
        bad(`${tag} header wrong: "${blk[0]}"`);

      const opts = blk.filter(l => /^\*?[A-F]:\s/.test(l));
      const fbs = blk.filter(l => /^Feedback:\s/.test(l));
      if (opts.length !== src.options.length) bad(`${tag} has ${opts.length} options`);
      if (fbs.length !== src.options.length) bad(`${tag} has ${fbs.length} feedback blocks`);

      // Two options with the SAME text. Coursera refuses the question outright with
      // "Duplicate answers are not allowed", and nothing else here would catch it: the counts,
      // the key, the feedback blocks and the reference are all correct. Checked on the BUILT
      // document, not only at parse time, so it cannot reach an upload.
      {
        const seenOpt = new Map();
        opts.forEach(l => {
          const t = l.replace(/^\*?[A-F]:\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
          const letter = (/^\*?([A-F]):/.exec(l) || [, '?'])[1];
          if (!t) return;
          if (seenOpt.has(t)) {
            bad(`${tag} options ${seenOpt.get(t)} and ${letter} have identical text — Coursera `
              + 'rejects the question ("Duplicate answers are not allowed")');
          } else seenOpt.set(t, letter);
        });
      }

      const starredOpts = opts.filter(l => l.startsWith('*'));
      if (starredOpts.length !== 1) bad(`${tag} has ${starredOpts.length} starred answers`);
      else if (starredOpts[0][1] !== src.correct)
        bad(`${tag} starred ${starredOpts[0][1]}, source says ${src.correct}`);

      src.options.forEach((o, oi) => {
        const wantOpt = (o.letter === src.correct ? '*' : '') + o.letter + ': ' + o.text;
        if (opts[oi] !== wantOpt)
          bad(`${tag} option ${o.letter} mismatch\n      got:  ${opts[oi]}\n      want: ${wantOpt}`);

        const wantFb = 'Feedback: ' + String(src.feedback[o.letter] || '').trim() + refer;
        if (fbs[oi] !== wantFb) {
          bad(`${tag} feedback ${o.letter} mismatch\n      got:  ${JSON.stringify(fbs[oi])}`
            + `\n      want: ${JSON.stringify(wantFb)}`);
          return;
        }
        // A break inside the EXPLANATION is always wrong, in either layout. In the own-line
        // layout the one legitimate break is the fold's, between the explanation and the
        // reference; its count is checked exactly, further down.
        const explPart = layout === 'own-line' ? fbs[oi].split('\n')[0] : fbs[oi];
        if (explPart.includes('\n'))
          bad(`${tag} feedback ${o.letter}: the explanation contains a line break`);
        // The verdict word is the answer key; Coursera shows right/wrong itself, and leaving
        // it in would tell the learner the answer inside every option's feedback. The trailing
        // punctuation is part of the test, not decoration: one explanation in the Module 3
        // graded quiz opens "Right signal and timing beat constant paging", which is a sentence
        // and not a verdict, and matching the bare word would fail a correct document.
        if (/^Feedback:\s*(Correct|Right|Wrong|Incorrect|Not quite)\s*[.!,:]/i.test(fbs[oi]))
          bad(`${tag} feedback ${o.letter}: verdict word still present -> "${fbs[oi].slice(0, 50)}"`);
        const expl = fbs[oi].replace(/^Feedback:\s*/, '');
        if (!expl || !/^[A-Z0-9"“(‘’']/.test(expl))
          bad(`${tag} feedback ${o.letter}: explanation starts oddly -> "${expl.slice(0, 50)}"`);

        if (!wantRefs.length) {
          bad(`${tag} feedback ${o.letter}: no reference — every question must point back at the `
            + 'course material it was written from');
          return;
        }
        if (!fbs[oi].endsWith(refer))
          bad(`${tag} feedback ${o.letter}: reference not at end of the line`);
        for (const r of wantRefs) {
          if (!oneRef(refStyle).test(r)) bad(`${tag} feedback ${o.letter}: bad reference "${r}"`);
        }
        // Exactly ONE separator between the explanation and the reference: a single newline
        // where the reference paragraph was folded on, a single space in the bracketed form.
        // Anything longer means a stray space or a second break survived into the document.
        if (/\s\s+\(?Refer to Module/.test(fbs[oi]))
          bad(`${tag} feedback ${o.letter}: more than one space or break before the reference`);
        const breaks = (fbs[oi].match(/\n/g) || []).length;
        if (breaks !== (layout === 'own-line' ? 1 : 0)) {
          bad(`${tag} feedback ${o.letter}: ${breaks} line break(s), expected `
            + `${layout === 'own-line' ? 1 : 0} for the ${layout} layout`);
        }
        // And the layout must be the one this document was built for. An own-line reference in
        // a bracketed document, or the reverse, is exactly what this pair of checks exists for —
        // both layouts are in use in this course, so neither can be assumed.
        const isBracketed = /\(\s*Refer to Module/.test(fbs[oi]);
        if (layout === 'own-line' && isBracketed)
          bad(`${tag} feedback ${o.letter}: the reference is bracketed, but this document is `
            + 'built with the reference on its own line');
        if (layout === 'bracketed' && !isBracketed)
          bad(`${tag} feedback ${o.letter}: the reference is not bracketed, but this document `
            + 'is built bracketed');
        const opens = (fbs[oi].match(/\(/g) || []).length;
        const closes = (fbs[oi].match(/\)/g) || []).length;
        if (opens !== closes)
          bad(`${tag} feedback ${o.letter}: unbalanced brackets (${opens} open, ${closes} close)`);
        if (!REF_TAIL(refStyle).test(fbs[oi]))
          bad(`${tag} feedback ${o.letter}: the line does not end in the ${layout} reference `
            + `form -> "…${fbs[oi].slice(-70)}"`);
        refCount++;
      });

      // One prompt paragraph. A second is an unmatched line and can break the parse for the
      // WHOLE document, not just this question.
      const firstOpt = blk.findIndex(l => /^\*?[A-F]:\s/.test(l));
      const gotPrompt = blk.slice(1, firstOpt).map(p => p.replace(/\s+/g, ' ').trim());
      const wantPrompt = [String(src.prompt).replace(/\s+/g, ' ').trim()].filter(Boolean);
      if (JSON.stringify(gotPrompt) !== JSON.stringify(wantPrompt))
        bad(`${tag} prompt text mismatch\n      got:  ${JSON.stringify(gotPrompt)}`
          + `\n      want: ${JSON.stringify(wantPrompt)}`);
      if (gotPrompt.some(p => p.includes('\n')))
        bad(`${tag} prompt contains an intra-paragraph line break`);

      gotPrompt.forEach((p, i) => {
        // A line beginning "Word:" is read by the importer as an answer option. One word before
        // the colon is a label; several are prose. Reported, not failed.
        const label = /^([A-Za-z][A-Za-z ]{0,24}):\s/.exec(p);
        if (label && !/\s/.test(label[1])) {
          atRisk.push(`${label2(label[1], tag, quiz)}`);
          console.log(`   NOTE ${tag} prompt opens the one-word label "${label[1]}:" — kept verbatim; `
            + 'the importer reads such a line as an answer option');
        }
        if (/^\s|\s$/.test(blk[1 + i] || ''))
          bad(`${tag} prompt paragraph ${i + 1} has stray leading/trailing whitespace`);
        const px = (secPairs[start + 1 + i] || {}).x || '';
        const nRuns = (px.match(/<w:r>/g) || []).length;
        if (nRuns !== 1) bad(`${tag} prompt paragraph ${i + 1} has ${nRuns} runs — must be exactly 1`);
      });

      for (let i = 0; i < blk.length - 1; i++) {
        if (/^\*?[A-F]:\s/.test(blk[i]) && !/^Feedback:\s/.test(blk[i + 1]))
          bad(`${tag} option not followed by Feedback: ${blk[i].slice(0, 40)}`);
      }

      // Exact line grammar the importer accepts: header, one prompt, then option/feedback
      // pairs. Any extra or unrecognised line is what triggers "need to be in the correct
      // format" — or, worse, nothing importable at all.
      const shape = blk.map(l =>
        /^Question \d+ - /.test(l) ? 'H'
        : /^\*?[A-F]:\s/.test(l) ? 'O'
        : /^Feedback:\s/.test(l) ? 'F'
        : 'P');
      const wantShape = 'HP' + 'OF'.repeat(src.options.length);
      if (shape.join('') !== wantShape)
        bad(`${tag} line grammar is ${shape.join('')}, expected ${wantShape}`
          + `\n      offending lines: ${JSON.stringify(blk.filter((l, i) =>
            shape[i] === 'P' && i !== 1).map(l => l.slice(0, 60)))}`);
    });

    const guide = lines.slice(e).join('\n');
    if (!/Guide Section/.test(guide)) bad('Guide Section missing');
    if (!/will not be imported/.test(guide)) bad('reference disclaimer missing');
    if (lines.slice(0, s).some(l => /^Question \d+ - /.test(l))) bad('question found before start marker');
    // The traceability table must name the source document, so a built file can always be
    // traced back to the assessment it came from.
    if (!guide.includes(quiz.source + '.docx')) bad('Guide Section does not name the source document');

    console.log(`   ${idx.length} questions | ${refCount} feedback blocks with reference line | `
      + `${wantSections.length} template sections in order | ${new Set(used).size} live hyperlinks | `
      + 'package OK');
    fs.rmSync(ex, { recursive: true, force: true });
  }

  const nQ = files.reduce((a, f) => a + f.quiz.questions.length, 0);
  const nF = files.reduce((a, f) => a + f.quiz.questions.reduce((b, q) => b + q.options.length, 0), 0);
  console.log(fail === 0
    ? `\n✅ ALL CHECKS PASSED — ${files.length} ${summaryNoun}, ${nQ} questions, ${nF} feedback `
      + 'blocks, every reference resolved against the syllabus.'
    : `\n❌ ${fail} CHECK(S) FAILED`);

  if (atRisk.length) {
    console.log(`\n⚠  ${atRisk.length} prompt line(s) kept verbatim that Coursera is known to mishandle:`);
    atRisk.forEach(x => console.log('     ' + x));
    console.log('   A line opening "Word:" is read as an answer option. Import ONE file and check');
    console.log('   the question count before relying on the set.');
  }
  return fail;
}

const label2 = (word, tag, quiz) => `${quiz.source}: ${tag} prompt opens "${word}:"`;

module.exports = { verifyAll, SP };

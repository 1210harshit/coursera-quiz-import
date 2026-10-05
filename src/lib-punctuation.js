// Punctuation pass, run by each course parser on its parsed quizzes before the import
// documents are built (requested 2026-09-30: "check if any punctuation is missing and add it").
//
// Only what is unambiguously missing or broken is changed. Every change is recorded on the
// question — q.punct lists {field, before, after, rule} — and the field's source text is kept
// in q.original, so the verifier still checks the ORIGINAL wording against the source document
// and a punctuation fix can never mask a real mismatch.
//
// Rules:
//   END-PROMPT    A prompt with no end punctuation gets "?" when its last sentence is a
//                 question (opens with What / Which / How / Why / ...), "." otherwise.
//   END-FEEDBACK  An explanation with no end punctuation gets ".".
//   END-OPTION    An option gets "." only when OTHER options in the same question end with
//                 punctuation. Where all four are written without it ("Profile", "Knowledge
//                 source", "Category = High; ...") that is the author's style for short answer
//                 labels, not a missing mark, and is left alone.
//   QUOTE-PAIR    A curly quote closed by a straight one (“text") is closed with the matching
//                 curly mark (“text”), and the reverse.
//   QUOTE-STRAY   A single straight quote at the very start or end of a field, with no other
//                 quote mark in it, is a stray keystroke and is removed.
//
// Abbreviations ("e.g.,", "a.m.,") are never touched, and nothing inside a sentence is
// rewritten — spacing and wording stay the author's.

const END = /[.?!:;…](?:["”’)\]]*)$/;
const QUESTION_START = /^(?:What|Which|How|Why|When|Where|Who|Whom|Whose|Is|Are|Was|Were|Do|Does|Did|Can|Could|Should|Would|Will|Has|Have|Had|May|Might|Must)\b/;

function lastSentence(t) {
  const parts = t.split(/(?<=[.?!])\s+(?=[A-Z“"(])/);
  return parts[parts.length - 1];
}

function fixQuotes(t) {
  let out = t, rule = null;
  // “...\"  ->  “...”      and      "...”  ->  “...”
  const a = out.replace(/“([^“”"]*)"/g, '“$1”');
  if (a !== out) { out = a; rule = 'QUOTE-PAIR'; }
  const b = out.replace(/"([^“”"]*)”/g, '“$1”');
  if (b !== out) { out = b; rule = 'QUOTE-PAIR'; }
  const straight = (out.match(/"/g) || []).length;
  const curly = (out.match(/[“”]/g) || []).length;
  if (straight === 1 && curly === 0) {
    if (/^"/.test(out)) { out = out.slice(1); rule = 'QUOTE-STRAY'; }
    else if (/"$/.test(out)) { out = out.slice(0, -1); rule = 'QUOTE-STRAY'; }
  }
  return { text: out, rule };
}

function punctuate(quizzes) {
  const log = [];
  for (const qz of quizzes) for (const q of qz.questions) {
    if (q.layout === 'REPLACED') continue;            // authored text, not the source's
    const promptAtStart = [...q.prompt];
    const record = (field, before, after, rule) => {
      (q.punct = q.punct || []).push({ field, before, after, rule });
      q.original = q.original || { prompt: null, options: {}, feedback: {} };
      if (field === 'prompt') { if (!q.original.prompt) q.original.prompt = promptAtStart; }
      else {
        const [kind, letter] = field.split(':');
        const bag = kind === 'option' ? q.original.options : q.original.feedback;
        if (!(letter in bag)) bag[letter] = before;
      }
      log.push(`${qz.file} Q${q.num} ${field} [${rule}]: …${before.slice(-45)}  →  …${after.slice(-45)}`);
    };

    // ---- prompt ----
    q.prompt.forEach((p, i) => {
      let t = p;
      const qf = fixQuotes(t);
      if (qf.rule) { record('prompt', t, qf.text, qf.rule); t = qf.text; }
      if (i === q.prompt.length - 1 && !END.test(t)) {
        const after = t + (QUESTION_START.test(lastSentence(t)) ? '?' : '.');
        record('prompt', t, after, 'END-PROMPT');
        t = after;
      }
      q.prompt[i] = t;
    });

    // ---- options ----
    const punctuated = q.options.map(o => END.test(fixQuotes(o.text).text));
    const mixed = punctuated.some(Boolean) && !punctuated.every(Boolean);
    q.options.forEach((o, i) => {
      let t = o.text;
      const qf = fixQuotes(t);
      if (qf.rule) { record('option:' + o.letter, t, qf.text, qf.rule); t = qf.text; }
      if (mixed && !punctuated[i]) { record('option:' + o.letter, t, t + '.', 'END-OPTION'); t += '.'; }
      o.text = t;
    });

    // ---- explanations ----
    for (const o of q.options) {
      let t = q.feedback[o.letter];
      const qf = fixQuotes(t);
      if (qf.rule) { record('feedback:' + o.letter, t, qf.text, qf.rule); t = qf.text; }
      if (!END.test(t)) { record('feedback:' + o.letter, t, t + '.', 'END-FEEDBACK'); t += '.'; }
      q.feedback[o.letter] = t;
    }
  }
  return log;
}

module.exports = { punctuate };

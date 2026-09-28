// The reference line for "Coaching and Mentoring the People You Manage Daily".
//
// ONE definition, required by all three builders AND all three verifiers, because the verifier
// re-derives the expected string independently and a one-sided edit is what has broken this
// twice before. Change the style here and both sides move together.
//
// THE FORM. Module and lesson spell out in full words and the asset kind carries NO number:
//
//   Feedback: <explanation> Refer to Module 1 Lesson 1 Video: Finding the Time to Stay Connected
//
// The title is what identifies the item for the learner, so the ordinal is internal bookkeeping
// and never reaches them. quiz.json and outline.json keep the compact M1L1V1 form and every
// mapping check is still written against it — only this learner-facing line expands.
//
// The label is the Coursera item type the learner sees. Every mapping in this course is a V
// code, which is a video by construction, so every line reads "Video:". A course with questions
// written from a reading or a lab labels those "Reading:" / "Lab:" instead — see
// deploying-ai-agents, which carries a REFERENCE_AS table for exactly that case. The diagnostic
// is not tied to a video and references its module instead: "Refer to Module 1: <module title>".
//
// BRACKETED OR PLAIN. Two forms are in use across the repo and the choice is per document:
//
//   plain      Feedback: <explanation> Refer to Module 1 Lesson 1 Video: <title>
//   bracketed  Feedback: <explanation> (Refer to Module 1 Lesson 1 Video: <title>)
//
// This course is PLAIN throughout, at the course owner's request on 2026-09-28 after reviewing
// the form on the deploying-ai-agents Module 1 Lesson 3 practice quiz. The separator is ONE
// space either way, and the reference is always last on the line.
//
// To move a single document back to brackets, add its key to PLAIN_EXCEPTIONS. Keys are
// "graded:M<n>", "practice:M<n>L<n>" and "diagnostic".
const PLAIN_BY_DEFAULT = true;
const PLAIN_EXCEPTIONS = new Set();

// ON ITS OWN LINE. The reference is a separate, zero-spaced paragraph directly below the
// Feedback: paragraph, with nothing between them:
//
//   Feedback: <explanation>
//   Refer to Module 1 Lesson 1 Video: Finding the Time to Stay Connected
//
// Settled by an upload of src/managing-break-probe.js (2026-09-28), which tried ten encodings
// in one document. Every <w:br/> variant — in one run, in its own run, typed textWrapping, a
// <w:cr/> — came back from Coursera as several blank rows with stray spaces before the
// reference. Only a separate paragraph imported as one clean line break, and it kept the
// question. A BLANK paragraph between the two still rejects the question, so nothing may sit
// between them.
//
// --no-br restores the single-line form, "Feedback: <explanation> Refer to ...", on both the
// builder and the verifier at once.
const REF_OWN_LINE = !process.argv.includes('--no-br');
const SEP = REF_OWN_LINE ? '\n' : ' ';

const isPlain = key => {
  const listed = PLAIN_EXCEPTIONS.has(key);
  return PLAIN_BY_DEFAULT ? !listed : listed;
};

// "M1L1V2" -> "Module 1 Lesson 1 Video"
const spellOut = code => String(code).replace(
  /^M(\d+)L(\d+)V\d+$/, (s, mo, le) => `Module ${mo} Lesson ${le} Video`);

// The reference as it appears — bare in the plain style, parenthesised otherwise.
const wrap = (refer, key) => isPlain(key) ? refer : `(${refer})`;

// What the feedback must END with: the separator (a line break, or one space under --no-br)
// followed by the reference. The verifiers check against this, so a document built in the
// other style fails rather than ships.
const trailer = (refer, key) => SEP + wrap(refer, key);

// Join an explanation to its reference in this course's style.
const attach = (explanation, refer, key) => explanation + trailer(refer, key);

module.exports = {
  PLAIN_BY_DEFAULT, PLAIN_EXCEPTIONS, REF_OWN_LINE, SEP,
  isPlain, spellOut, wrap, trailer, attach,
};

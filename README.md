# Coursera Quiz Import Builder

Tooling that turns a course's **graded assessment** and **course outline** (both `.docx`) into
**Coursera Assignment Import documents** — one per module, ready to upload via a quiz item's
**Import** button.

Each generated document follows Coursera's Assignment Import Template: a machine-read
*Import Section* between two marker lines, plus a human-facing *Guide Section* that the
importer ignores.

No course content lives in this repository — only the scripts.

---

## Why this exists

Every source document is formatted differently, and most are internally inconsistent. Nine
courses produced **nine different question layouts** — lettered options vs. bare bullets,
three spellings of "Explanations for Incorrect Options", answer keys given explicitly, given
only by a `(Correct)` marker, or shared with the mapping on one line. Hand-conversion is
slow and silently error-prone, so each course gets a dedicated parser feeding a shared
builder and a strict verifier.

---

## The Coursera import format

Rules the importer actually enforces, learned by importing and reading the error logs.

### Accepted question grammar

```
Question 1 - multiple choice, shuffle
<prompt — exactly one line>

A: <option text>
Feedback: <explanation> (Refer to M1L1V1: <video title>)

*B: <option text>
Feedback: <explanation> (Refer to M1L1V1: <video title>)
```

- Questions **must** start with the literal English `Question <n>`; properties follow a hyphen.
- The correct answer is marked with a leading `*` — **not** a "Correct Answer:" line.
- `Feedback:` must be the line immediately after its option.
- Only content between `----- Importable content starts here -----` and
  `----- End of importable content -----` is imported.

### Constraints that cause silent failures

| Rule | Why |
|---|---|
| A prompt must not begin `Word:` | A line starting `Scenario:` is read as an **answer option**. This rejected every scenario question until the label was removed. |
| Guidance prose must not quote the marker strings | Coursera's own template says *"Imported content"* in prose but *"Importable content"* in the markers, precisely to avoid a false match. |
| Keep the reference inside the `Feedback:` paragraph | A free-standing `Refer to …` paragraph is an unmatched line and rejects the question. |
| Prompt length is **not** a limit | Coursera's own reference prompt runs ~800 characters. |

---

## Pipeline

Three stages per course, plus shared libraries.

```
<course>-parse-quiz.js     .docx  ->  quiz.json      questions, options, key, feedback, mapping
<course>-parse-outline.js  .docx  ->  outline.json   M<x>L<y>V<z> -> video title, LOs, instructor
<course>-build.js          json   ->  N x .docx      one import document per module
<course>-verify.js         .docx  ->  pass/fail      re-reads the OUTPUT and checks it
```

Run order:

```bash
node src/osha-parse-outline.js            > work/osha/outline.json
node src/osha-parse-quiz.js               > work/osha/quiz.json
node src/osha-build.js   work/osha/dist
node src/osha-verify.js  work/osha/dist
```

Parsers accept `--report` to print question counts and warnings instead of JSON — the normal
way to iterate on a new source document until warnings reach zero.

### Working directory

Scripts read from `work/<course-slug>/`, expecting the source `.docx` files unzipped into
`work/<course-slug>/quiz/` and `work/<course-slug>/outline/`. Those directories hold client
course content and are git-ignored.

---

## What the verifier checks

`*-verify.js` re-opens the generated `.docx` and asserts, per question:

- exact line grammar `HEADER → PROMPT → (OPTION, FEEDBACK) × 4`
- exactly one starred answer, matching the source key
- option and feedback text byte-identical to the source
- reference line matches the outline's title for that mapping
- no intra-paragraph line breaks anywhere in the import section
- no bold/italic/underline/strike/colour/highlight on any run
- no stringified values (`[object Object]`, bare `undefined`) leaked into text
- all 30 template sections present in order, and every hyperlink resolving

It also checks the package: `[Content_Types].xml`, rels, no dangling `comments.xml`.

---

## Shared libraries

| File | Purpose |
|---|---|
| `lib-zipwriter.js` | Minimal OPC/zip writer (`[Content_Types].xml` forced first). Avoids a zip binary dependency. |
| `lib-lines.js` | Paragraph extractor that splits on `<w:br/>` — several sources put options on break-separated lines inside one paragraph. |
| `lib-lines-strikeaware.js` | As above, but **drops struck-through runs**. Two sources mark superseded wording with `<w:strike w:val="1"/>` while keeping the replacement inline. |
| `tool-extract-formatted.js` | Debug dump with bold/colour/style annotations — first thing to run against an unfamiliar source. |
| `tool-audit-*.js` | One-off audits: source-vs-output fidelity, whitespace, block structure. |

---

## Per-course source notes

Quirks each parser exists to absorb.

| Course | Notable source issues |
|---|---|
| **osha** | `Scenario:` prompt labels rejected by the importer; verdict words (`Correct.` / `Incorrect.`) stripped from feedback. |
| **genai-marketing** | Two options merged onto one line; three questions carry duplicate explanation blocks; a stray `A: :`. |
| **genai-marketing-explanations** | Correct option's entry is a placeholder (`B :Correct Answer`); mappings written in prose; three incorrect-explanation headers. |
| **genai-retail** | Cleanest source. Outline claims 40 questions where the quiz has 20 — time estimate derived per-question. |
| **pm-course-1** | Two question formats mixed; anchors `Q1`, `Q. 10`, `Question 4 \| Mapped to: …`; two questions have no mapping. |
| **pm-course-2** | Q10 of each module differs: key and mapping share a line (`Correct Answer: B \| Mapped to: C2M1L3V3`). |
| **pm-course-3** | One question uses lowercase unspaced labels (`a.(Incorrect)`) and trailing em dashes on every option. |
| **cstp-course-1** | Three files, three anchor styles; Module 2's incorrect explanations are unlabelled bullets matched positionally. |
| **genai-appdev** | Struck-through text throughout; answer key given *only* by a `(Correct)` marker. |
| **management-mastery** | Struck draft wording; one question carries two complete option sets. |

### Recurring outline trap

Most outlines end with a *Supplementary Items* table containing a "Course Wrap-up Video".
Parsed naively it overwrites the last real video of the last lesson (`M4L3V1`). Every outline
parser resets module/lesson scope at that heading and refuses duplicate keys.

---

## Requirements

Node.js (no dependencies) and `unzip` on `PATH` for the verifiers.

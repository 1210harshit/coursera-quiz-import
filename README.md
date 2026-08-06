# Coursera Import Builders

Tooling that turns a course's source `.docx` documents into the files Coursera's importers
accept. Two independent pipelines share this repository:

| Pipeline | In | Out | Uploaded via |
|---|---|---|---|
| **Quiz import** | graded assessment + outline `.docx` | one **Assignment Import** `.docx` per module | **Import** on a quiz item |
| **Course-content import** | course outline `.docx` | one **Course Import** `.xlsx` | **Import** in *Edit Content* |

Each generated assignment document follows Coursera's Assignment Import Template: a
machine-read *Import Section* between two marker lines, plus a human-facing *Guide Section*
that the importer ignores. Each generated course-import workbook is Coursera's own Course
Template with its **FOR IMPORT** sheet filled in.

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

## Quiz import pipeline

Three stages per course, plus shared libraries. For the course-content pipeline see
[Course-content import](#course-content-import) below.

```
<course>-parse-quiz.js     .docx  ->  quiz.json      questions, options, key, feedback, mapping
<course>-parse-outline.js  .docx  ->  outline.json   M<x>L<y>V<z> -> video title, LOs, instructor
<course>-build.js          json   ->  N x .docx      one import document per module
<course>-verify.js         .docx  ->  pass/fail      re-reads the OUTPUT and checks it
```

Run order:

```bash
node src/genai-retail-parse-outline.js > work/genai-retail/outline.json
node src/genai-retail-parse-quiz.js    > work/genai-retail/quiz.json
node src/genai-retail-build.js  work/genai-retail/dist
node src/genai-retail-verify.js work/genai-retail/dist
```

Parsers accept `--report` to print question counts and warnings instead of JSON — the normal
way to iterate on a new source document until warnings reach zero.

### Working directory

Scripts read and write under `work/`, which is git-ignored so course documents are never
committed. Each course lives in `work/<course-slug>/` with the source `.docx` files unzipped
into `quiz/` and `outline/`. Coursera's Assignment Import Template must be unzipped once into
`work/tmpl/` — every builder clones it for styles and hyperlink relationships.

Override the root with the `QUIZ_WORK` environment variable.

**See [SETUP.md](SETUP.md)** for installation, the full run-through, how to onboard a new
course, and troubleshooting.

---

## What the verifiers check

`course-import-verify.js` re-opens the generated `.xlsx` and asserts:

- module and lesson counts match `course.json`, and every `***Name` is filled
- lesson numbering restarts at 1 per module and the name matches its position
- every item type is offered under the selected course offering type, read live from the
  **Ranges** sheet — not from a list hard-coded here
- the item-type dropdown's source range actually reaches every type the course uses, so an
  appended type is not left outside it
- item type, name and duration are byte-identical to `course.json`
- module time estimates equal the sum of their own items, and the course estimate the sum of all
- IVQ flags and video types appear only on `Video` rows, and only dropdown-legal values
- no template placeholder string (`[Module name goes here]`, …) survived anywhere
- the item-type dropdown's `sqref` still covers every item row after re-layout
- package sanity: all four sheets present, no relationship pointing at a dropped part

`*-verify.js` (quiz) re-opens the generated `.docx` and asserts, per question:

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

## Course-content import

The second pipeline. Same source outline, different Coursera importer: instead of quiz
questions it produces the **course structure** — modules, lessons, and the video / reading /
discussion / lab / assignment items inside them — as one `.xlsx`.

```
<course>-parse-course.js   .docx  ->  course.json   modules, lessons, items, durations
course-import-build.js     json   ->  1 x .xlsx     Coursera Course Template, FOR IMPORT filled
course-import-verify.js    .xlsx  ->  pass/fail     re-reads the OUTPUT
```

```bash
node src/cstp-course-1-parse-course.js > work/cstp-course-1/course.json
node src/course-import-build.js  cstp-course-1
node src/course-import-verify.js cstp-course-1
```

One builder serves every course — the parsers already normalise to a single `course.json`
shape, so unlike the quiz side there is nothing course-specific left to vary.

The Course Template ships with the repo at `templates/coursera-course-template.xlsx`, so this
pipeline needs no download — it is Coursera's blank template, carrying no course content and
no personal metadata (no `docProps`, empty comment authors, empty threaded-comment person
list). Unzip a different one into `work/tmpl-course/` to override it.

### Why the template is cloned, not authored

The workbook is not written from scratch. Coursera's Course Template carries an item-type
dropdown driven by a hidden **Ranges** sheet, a `[h]:mm:ss` duration format, and `***` / `**`
markers the importer keys on. The builder regenerates the **FOR IMPORT** sheet from the
template's *own* rows, substituting values and keeping every style id, so all of that
survives. The other three sheets are untouched.

Two template parts are dropped on the way through: conditional formatting (it only reddened
placeholder strings that no longer exist) and the sheet's cell notes (anchored to template row
numbers, so after re-layout they would point at unrelated cells).

### Mapping decisions

Outlines describe items in their own vocabulary. The parsers normalise:

| Outline label | Coursera item type | |
|---|---|---|
| `Intro Video`, `Video N`, `Promo video` | Video | |
| `Reading` | Reading | |
| `DPQ` | Discussion Prompt | |
| `Hands-on-lab` | Peer Review | graded — the labs all end in a submitted deliverable |
| `Role Play` | Roleplay | not in the bundled template; appended, see below |
| `Graded Quiz` | Assignment | |
| `Course-end Project` | Peer Review | |

The verifier re-checks each item against the allow-list the Ranges sheet publishes for
whichever offering type is selected in `B23`, so a mapping that is legal under Private but not
Public fails the build rather than the import.

**Hands-on labs are graded.** They map to Peer Review, not Ungraded Lab, because every lab in
these outlines ends in a submitted artefact ("Submit a document containing three versions…")
rather than an in-platform lab environment. Each one therefore needs submission instructions
and a rubric configured in Coursera after import — an Ungraded Lab would not.

**Roleplay postdates the template.** Coursera's AI role-play item is not in the Course
Template's Ranges lookup, so `course-import-build.js` appends any such type to rows 15+ of that
sheet and widens the item-type dropdown to `$E$3:$E$<last>` to match. Without that the value
still imports, but the dropdown rejects it the moment anyone edits the cell. The build prints
a `WARN` naming every type it had to append; the verifier then confirms the dropdown range
actually reaches it.

Video format maps to the three the template's dropdown offers: `Talking Head` → *Talking
head*, `Demo` / `Screenshare` → *Screen capture*, `Conceptual` / `Slides` → *Slide voiceover*.

Durations collapse a range to its midpoint (`5-7 mins` → 6). A blank cell takes a per-parser
default and **always** emits a warning — never silently.

### Structural rules

| Rule | Why |
|---|---|
| Lesson numbering restarts at 1 in each module, and the name repeats it (`Lesson 2: Know your audience`) | Coursera shows the lesson *name* in the outline; the number column is reference only. Enforced by the verifier. |
| Course-level intro items are prepended to module 1, lesson 1 | Coursera has nowhere to hang an item that belongs to no lesson. |
| Supplementary items become a final extra lesson on the last module | Keeps the outline's own module count and its "modules are independent" rationale intact. |
| Item descriptions carry the full brief | A Discussion Prompt's description *becomes* the prompt; a lab's becomes the instructions. Newlines survive via a wrapping cell style added at build time. |

### What the import does not carry

It creates the outline and triggers uploads where a public link exists. It does **not** import
question content — IVQs and graded-quiz questions are authored in Coursera afterwards, or
loaded through the quiz pipeline above.

### Module learning objectives

Parsers emit only what the outline states: the module's aligned course-level objective. Most
outlines carry nothing finer. Richer per-lesson objectives are a normal manual edit to
`course.json` between the parse and build steps — that is what the intermediate JSON is for.

---

## Shared libraries

| File | Purpose |
|---|---|
| `lib-zipwriter.js` | Minimal OPC/zip writer (`[Content_Types].xml` forced first). Avoids a zip binary dependency. Used by both pipelines. |
| `lib-xlsx.js` | SpreadsheetML plumbing for the course-content builder: shared-string append, a row splitter, and a cell rewriter that clones a template row and preserves its style id. |
| `lib-outline-course.js` | Outline block reader plus the item-type, video-format and duration rules shared by every `*-parse-course.js`. Drops struck-through runs, so superseded draft wording never splices into its own replacement — the outline equivalent of `lib-lines-strikeaware.js`. |
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

### Course-content parser notes

Only the two courses below have a `*-parse-course.js` so far. Their sources differ enough to
show what a third will need.

| Course | Source shape |
|---|---|
| **genai-marketing** | Headings carry the name inline (`Module 2: AI-Powered Content Marketing`, `Lesson 1: MultiModal Content Generation`). Descriptions follow a bare `Description:` label on the next paragraph. Every duration is stated. |
| **management-mastery** | Same bare headings as `cstp-course-1`, single course. `Course Title;` uses a semicolon. Aligned objectives state their own text inline and alternate `LO1:` / `LO2 -`. Two Readings per third lesson. DPQ rows carry no title and no questions, only the placeholder "2 open-ended questions". The Module 3 Role Play and the Promo video have no title. Superseded role-play wording is struck through inline. |
| **cstp-course-1** | Headings are bare (`Module 1`, `Lesson 1`) with the name on a following `Title of the Module:` line. One document holds four courses, so capture runs from `Course 1` to `Course 2`. Role Play rows and one Reading leave Est. Time empty — each raises a warning and takes a default. Module 2 leaves the aligned-objective value blank and puts `C1LO2 - …` on the next line; Module 3 writes it as a bullet. DPQ rows have no title and prefix each question `DPQ 1:` / `DPQ 2:`. |

### Recurring outline trap

Most outlines end with a *Supplementary Items* table containing a "Course Wrap-up Video".
Parsed naively it overwrites the last real video of the last lesson (`M4L3V1`). Every outline
parser resets module/lesson scope at that heading and refuses duplicate keys. The
course-content parsers use the same heading to *start* collecting wrap-up items instead, and
emit them as a final lesson.

---

## Requirements

Node.js (no dependencies) and `unzip` on `PATH` for the verifiers.

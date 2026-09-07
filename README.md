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

### Text fidelity

Source text reaches the import section **verbatim, in source order**. Only leading and trailing
whitespace is removed — a run of spaces inside a line is the author's and survives. Where a
source puts text on separate lines, whether as separate paragraphs or as `<w:br/>` inside one,
those stay separate lines and become separate paragraphs; the builder holds them apart with
paragraph spacing rather than an empty paragraph, since a blank line inside a prompt can
terminate it for the importer.

Exactly two things are removed on the way through, both deliberate:

| Removed | Why |
|---|---|
| A leading `Scenario:` label on the first prompt line | Not cosmetic. A line beginning `Word:` is read by the importer as an **answer option**, which rejected every scenario question on `osha`. Without this the question does not import. |
| A leading `(Correct)` / `(Incorrect)` marker, or a `Correct Explanation:` / `Incorrect Explanation:` label, on an explanation | Coursera already shows the learner whether their option was right, so the marker only repeats the interface — and beside an option the learner did not pick, on a shuffled quiz, it reads as wrong. |

Labels the parsers consume as metadata — the option letter, the running question number, the
`Mapped to:` and `Bloom's Level:` lines — are not text; they are structure, and they reappear
as the document's own `Question N` headers and `*A:` markers.

`tool-audit-fidelity.js` re-reads a built document against its source and reports anything
else that differs.

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

The two parse stages are independent for most courses. Three read `outline.json` from the quiz
parser and so must run after the outline stage — each says so and exits if the file is missing:
`google-ads`, which states its mapping as a video *title* rather than an `M<x>L<y>V<z>` code and
has to resolve it; `paid-social`, which states a code but writes the title beside it and checks
the two agree; and `paid-ads-11`, which does the same and then **overrules the code with the
title** when they disagree, because in that source they disagree 17 times and the title is
always the one the question is about.

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
- no item name is under 5 characters, the length at which Coursera silently drops the row
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

**An appended type does NOT import.** `course-import-build.js` appends any type missing from the
Course Template's Ranges lookup to rows 15+ of that sheet and widens the item-type dropdown to
`$E$3:$E$<last>` to match. That makes the workbook open cleanly in Excel and pass
`course-import-verify.js`, and it is worth doing — but it does **not** make Coursera accept the
value. The importer has its own fixed list and refuses anything outside it:

```
Quiz item in cell A61 failed to be processed. Error reason: Item type Quiz is not supported
ITEM_TYPE_UNSET item in cell A57 failed to be processed. Error reason: Invalid item type in cell A57.
```

That is a real result from the `soft-skills` upload, which lost 17 of its 62 items to four
appended types — `Quiz`, `Quizzes`, `Dialogue` and `Roleplay` — while every type on the
template's own master list (`Video`, `Reading`, `Discussion Prompt`, `Peer Review`, `Assignment`)
imported without complaint. Coursera keeps the rest of the upload, so the loss is silent.

**Two different failures, and the difference matters.** `Quiz` came back named — Coursera read the
type and refused it. The other three came back as `ITEM_TYPE_UNSET`, meaning **no type was read
at all**. That is not a verdict on the type; it is Coursera failing to recognise the string. The
workbook is not at fault: a `Roleplay` cell is byte-identical in encoding and style to a
`Peer Review` cell that imported in the same upload. So when a type comes back `ITEM_TYPE_UNSET`,
vary the **spelling** — `Role Play`, `Dialogues` — rather than the mechanism.

**Observed to import:** `Video`, `Reading`, `Discussion Prompt`, `Peer Review`, `Assignment`.
The template's master list at `$E$3:$E$11` adds `Graded Discussion Prompt`, `Programming`,
`App item` and `Ungraded Lab`, which are untested here. A build `WARN` naming an appended type is
not a note about the dropdown — it is a warning that those rows may be dropped on import, so
import-test one module before relying on the workbook.

Earlier revisions of this file claimed an appended value "still imports". It does not follow
automatically; the paragraphs above replace that claim.

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
| Item names are at least **5 characters** | Coursera answers a shorter one with `Item name is too short in cell B<n>` and **drops that row** — the rest of the upload succeeds, so the loss is easy to miss. `course-import-build.js` refuses to write one; the verifier re-checks the sheet. Outlines do produce them: `paid-ads-11` names a Meta Business Suite video just `Help`. |

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
| **ai-toolkit** | Bare headings as `cstp-course-1`. DPQ rows put the questions in the *Title* column and the placeholder in the description — inverted from every other source. Video descriptions carry a literal `Description: ` label. Aligned objectives state only an id (`LO4`), resolved against Part 1. Lead Instructor is still the template placeholder, so Writer/SME is left blank. Part 1 also holds tool-application tables, ignored because their header cell is not "Learning Items". |
| **management-mastery** | Struck draft wording; one question carries two complete option sets. |
| **google-ads** | The first **table-based** quiz: one `<w:tbl>` per question with `Q.` / `A.`–`D.` / `Correct` / `Feedback` rows. Mapping is a **video title** (`Source video: …`), not a code, so the parser resolves titles through the outline's index — the outline must be parsed first. One explanation per question rather than one per option. Questions numbered 1–80 straight through, renumbered per module. An 81st table repeats question 40 verbatim after question 80. One `Source video` title drops a plural. Question 40 references a video taught in module 8 while sitting in module 4's set. |
| **paid-social** | Table-based like `google-ads` but a different table: the `Feedback` row carries no letter and belongs to the option above it. The answer key (`✅ Correct Answer: B`) arrives **after** its table, so a question only closes when that line is read. Every explanation opens with a literal `(Correct)` / `(Incorrect)` marker, stripped by the builder. Mapping is a code (`Mapped to: M1L1V8 - Title`), and five of the titles written beside those codes are truncated at an `&` — the reference line takes the outline's wording. Questions numbered 1–90 straight through. |
| **google-ads-final** | The rewritten assessment for the same course and the same outline as `google-ads`, so it takes a second slug the way `genai-marketing-explanations` does beside `genai-marketing`. Paragraph-based: `Module N` / `Question N` headings, `Mapped to: M1L1V1 \| Bloom's Level: Remember`, and the verdict stated as a paragraph *label* (`Correct Explanation:` / `Incorrect Explanation:`) rather than inline. 48 prompts are scenario-framed, with the scenario and the question in one paragraph separated by `<w:br/>`; `lib-lines.js` splits on the break and **each half stays its own line**, becoming its own paragraph in the built document. The first Google Ads source to record a Bloom's level. |
| **ai-toolkit-v2** | The v2 assessment for the course whose v1 outline `ai-toolkit-parse-course.js` reads; it is the first to give that course a quiz pipeline at all. Table-based, closest to `paid-social` — `Mapped to:` above the table, letterless `Feedback` rows belonging to the option above, `(Correct)` / `(Incorrect)` markers — with the key moved **inside the question cell** as its second paragraph, which makes each table self-contained. The cleanest source in the repository: 80 questions, zero warnings. |
| **digital-marketing** | Byte-for-byte the same shape as `ai-toolkit-v2`, so its parser is that one with the slug changed. 80 questions, zero warnings. Its answer key leans away from D (A:27 B:25 C:21 **D:7**), which shuffle hides from learners but is worth an author's eye. |
| **websites-15** | Table shape as `shopify`, including the `(Correct)` marker being the only statement of the key. What is new is that it **admits what it does not know**: an opening SOURCING NOTICE says captions existed for only 64 of the course's 308 videos, so 28 questions come from transcripts and 122 are `[DRAFT - no transcript]`, written from titles alone. The two groups carry different source lines and map to different levels — a video title for the 28, a lesson for the 122 — so the builder writes `(Refer to M3L1: <lesson>)` for the latter rather than guessing a video. Every DRAFT question is flagged in its document's working area. Answer key is only ever A or B. See "When a source states a lesson, not a video" below. |
| **shopify** | In the `ai-toolkit-v2` family, with one thing no other source does: there is **no answer-key line at all** — not after the table, not inside the question cell, nowhere. The key exists only as the `(Correct)` marker on one of the four explanations, so here that marker *is* the key rather than a second opinion about it, and a question with none or with two is a hard failure. Only `genai-appdev` does the same. Its mapping is the dotted video number in a `Source video: 1.1.2 - Title` line; the titles themselves contain hyphens, so only the first separator delimits. Answer key is B on 38 of 40. |
| **paid-ads-11** | The tidiest table: everything a question needs is inside it, including the mapping and the key, so nothing is carried across blocks. Module headings use a colon. `(Correct)` / `(Incorrect)` markers as `paid-social`. Its one real defect is **stale mapping codes**: on 17 of 110 questions the code disagrees with the video title stated beside it, and the prompt is always about the *title's* video — the codes were written against an earlier numbering. `resolve()` therefore prefers the title, and prefers an in-module match over an out-of-module one, because modules 1 and 3 share generic video names. Four module 3 questions have no in-module video at all and are reported as a content gap. |
| **ai-products** | Paragraph-based like `google-ads-final`, but the key and the mapping share **one line** (`✅ Correct Answer: B     Mapped to: M1L1V1`), so a single mistyped line loses both. The `(Correct)` marker on one of the four `A:` / `B (Correct):` explanations states the key a second time and is the only independent witness available; a disagreement is reported. Options are labelled `A.` and explanations `A:` — one character apart, which is why both patterns are punctuation-specific. 17 of 20 prompts are scenario-framed with the scenario and the question as **separate paragraphs**, not `<w:br/>`-separated as in `google-ads-final`; both reach the builder the same way. Its outline states no video numbers at all, so the mapping targets are derived — see "When the outline states no video number" in SETUP. Answer key leans hard to B (A:6 **B:13** C:1 D:0). |

### Course-content parser notes

Only the two courses below have a `*-parse-course.js` so far. Their sources differ enough to
show what a third will need.

| Course | Source shape |
|---|---|
| **genai-marketing** | Headings carry the name inline (`Module 2: AI-Powered Content Marketing`, `Lesson 1: MultiModal Content Generation`). Descriptions follow a bare `Description:` label on the next paragraph. Every duration is stated. |
| **management-mastery** | Same bare headings as `cstp-course-1`, single course. `Course Title;` uses a semicolon. Aligned objectives state their own text inline and alternate `LO1:` / `LO2 -`. Two Readings per third lesson. DPQ rows carry no title and no questions, only the placeholder "2 open-ended questions". The Module 3 Role Play and the Promo video have no title. Superseded role-play wording is struck through inline. |
| **cstp-course-1** | Headings are bare (`Module 1`, `Lesson 1`) with the name on a following `Title of the Module:` line. One document holds four courses, so capture runs from `Course 1` to `Course 2`. Role Play rows and one Reading leave Est. Time empty — each raises a warning and takes a default. Module 2 leaves the aligned-objective value blank and puts `C1LO2 - …` on the next line; Module 3 writes it as a bullet. DPQ rows have no title and prefix each question `DPQ 1:` / `DPQ 2:`. |
| **google-ads** | As `ai-toolkit` — bare headings, `Description: ` labels, aligned objectives as bare ids, placeholder Lead Instructor. Its own quirks: Reading rows are labelled `Reading (1)` and priced `5 mins each`, so the count comes from the label; the Course-end Project row states only a duration and a purpose note in the *link* column, which becomes its description; the Promo video row has a format but no title; the two course-level videos are priced `<=4 mins` and `<=2 mins`. |
| **paid-social** | The same template as `google-ads`, and the most completely filled in of the three — every supplementary row carries a title and a description. Its one defect is a count: Part 1 claims 234 IVQs where Part 2's tables hold 233. The parsers check Part 1's "Proof of Learning" numbers against the tables and name any disagreement. |
| **paid-ads-11** | `paid-social`'s outline grown to 11 platforms (v2). Same template, and clean: every Proof-of-Learning count matches the tables. Objective ids reach two digits (`LO10`, `LO11`), which is why every id pattern in these parsers is `\d+` rather than a single digit. |
| **ai-toolkit-v2** | The v2 outline for the same course as `ai-toolkit`, now on the shared template. Part 1 writes each objective as `LO1 (125 chars): …` — an authoring note between the id and the colon, skipped rather than captured. Four objectives serve eight modules, so several share one; nothing assumes a 1:1 mapping. Every Proof-of-Learning count matches the tables. |
| **shopify** | **Not the Starweaver template at all** — a design document, and the first outline here that needed a course parser written from nothing. Modules are single-cell banner tables (`MODULE 1 OF 4  \|  LO1` / name / `Learner goal:`), lessons are `Lesson 1.1 — Name  (Section 1)` paragraphs, and each lesson carries a `# \| Video Title \| Description` table plus a `Type \| Activity \| Duration` one. It has no `Learning Items` table, no per-item duration column, and no Lead Instructor line. It also introduces the **Quiz** item type (Coursera's ungraded practice quiz), appended to the Ranges lookup at build time exactly as `Roleplay` is. See "A source off the template" below. |
| **digital-marketing** | The shared template again, and the largest course here: 572 instructional videos over 24 lessons, 45h 26m. Two gaps the parsers report rather than paper over — Module 7 has no `Intro Video` row where every other module does, and it carries two lessons where the rest carry three. It also repeats the `Help` video name that broke the `paid-ads-11` import, at `M2L3V15`; the same `NAME_FIXUPS` treatment applies. |
| **ai-products** | The shared template with **one column missing**: the learning-items table is `Learning Item Title \| Video Format \| High level Description \| Est. Time \| Link`, with no `Learning Items` column, so no row states its own kind. `itemType()` still recognises the course-level and activity rows from their *titles* (`Graded Quiz`, `DPQ`, `Hands-on Lab: …`), and everything else is typed from the `Video Format` column, which doubles as the kind column here — a video row names a production format, the rest name a Coursera kind. Three rows need their own handling: the lesson-3 tables carry a **second header row** after which the rows are module-level, not lesson content; `Course-end Project` is written one column to the left, so its real name sits in the Video Format cell; and two rows prefix the name with their own kind and an arrow (`Hands-on-lab → Hands-on Lab: …`). Five objectives, two modules, one aligned each — `LO3`–`LO5` are promised by the description and claimed by no module. |

### When a source states a lesson, not a video

Every course before `websites-15` maps each question to one video. That one cannot: caption
files existed for 64 of its 308 videos, so 122 of its 150 questions were written from the
outline's titles rather than from a transcript, and the document says so in its first
paragraph. It marks them `[DRAFT - no transcript]` and gives them a lesson-level source line
(`Source: Module 3, Lesson 3.1 - …`) where the other 28 name a video (`Source video: …`).

The reference line follows the source's own precision rather than exceeding it:

```
Feedback: … (Refer to M1L1V3: Wordpress Installation)                  <- from a transcript
Feedback: … (Refer to M15L1: Pagecloud foundations and editor)         <- from titles only
```

Picking some video inside the lesson would put a *specific, wrong* pointer in front of a
learner — the question was never written from that video. Naming the lesson is exactly what the
source supports and still sends the learner to the right place. `referLine()` in the builder
and its mirror in the verifier accept both forms, and the verifier checks that the level in the
line is the level `quiz.json` recorded, so a lesson mapping cannot silently become a video one.

The DRAFT status is carried into each generated document: the working area opens with a count
and an explanation, and every row is marked `DRAFT — verify` or `From transcript`. Nobody
should publish 122 unverified questions without seeing that they are unverified.

### A source off the template

`shopify` is the first outline that is not a filled-in Starweaver template, and it is worth
reading before writing a parser for another one. Three of its problems will recur:

| Problem | What was done |
|---|---|
| **No per-item duration for videos.** The tables carry `# / Video Title / Description` and nothing else. | The source states its own answer twice — `Total Video Runtime ~9 hours` over 97 videos, and a production note that "every video keeps a consistent length: 4-8 minutes". Both land on 6 minutes. Used, and warned about **once** rather than 97 times. |
| **Durations in mixed units** — `8 min`, `60–90 min`, `3 hours of focused work`, `4–6 hours`. | `lib-outline-course`'s `minutes()` reads `3 hours` as 3. This parser carries its own `duration()` that reads the unit from the text instead of assuming minutes. |
| **Items belonging to no lesson** — two roleplays and a final project in a PART 3 of their own. | The source says where they go: *"Roleplay 1 is recommended after Module 2; Roleplay 2 after Module 4."* That is an instruction, so it is followed rather than dumping all three on the last module. Each lands in a lesson of its own, and the placement is reported. |

### Recurring outline trap

Most outlines end with a *Supplementary Items* table containing a "Course Wrap-up Video".
Parsed naively it overwrites the last real video of the last lesson (`M4L3V1`). Every outline
parser resets module/lesson scope at that heading and refuses duplicate keys. The
course-content parsers use the same heading to *start* collecting wrap-up items instead, and
emit them as a final lesson.

---

## Requirements

Node.js (no dependencies) and `unzip` on `PATH` for the verifiers.

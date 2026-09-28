# Setup

How to run the pipeline on your machine, and how to onboard a course that isn't here yet.

---

## 1. Requirements

| | |
|---|---|
| **Node.js** | 18 or newer. No npm dependencies — everything is standard library. |
| **unzip** | On `PATH`. Used to open `.docx` packages and by the verifiers. Included with Git for Windows (Git Bash), preinstalled on macOS and Linux. |

Check both:

```bash
node --version && unzip -v | head -1
```

---

## 2. Clone

```bash
git clone https://github.com/1210harshit/coursera-quiz-import.git
```

---

## 3. Working directory

Scripts read and write under `work/`, which is **git-ignored** — course documents never get committed.

```
coursera-quiz-import/
  src/                      the scripts (in git)
  templates/                Coursera's blank Course Template (in git)
  work/                     your data (ignored)
    tmpl/                   Coursera's Assignment Import Template, unzipped   <- quiz pipeline
    tmpl-course/            optional: a different Course Template, unzipped   <- overrides templates/
    <course-slug>/
      quiz/                 graded assessment .docx, unzipped
      outline/              course outline .docx, unzipped
      quiz.json             produced by parse-quiz
      outline.json          produced by parse-outline
      course.json           produced by parse-course
      dist/                 produced by build — the files you upload
```

Override the root with `QUIZ_WORK` if you'd rather keep data elsewhere:

```bash
QUIZ_WORK=/path/to/data node src/osha-build.js /path/to/data/osha/dist
```

### 3a. The templates (required, once per pipeline)

Every builder clones a Coursera template rather than authoring from scratch, so the generated
file inherits styles, dropdowns and relationships the importer depends on.

**Quiz pipeline** — the **Assignment Import Template**. Download it from Coursera (the *Import*
dialog on any quiz links to it), then:

```bash
mkdir -p work/tmpl && unzip -q "Coursera Assignment Import Template.docx" -d work/tmpl
```

`work/tmpl/word/document.xml` must exist. Without it every quiz build fails immediately.

**Course-content pipeline** — nothing to do. A blank copy of Coursera's **Course Template** is
committed at `templates/coursera-course-template.xlsx`, and the builder unzips it itself.

To try a different or newer template, unzip yours into `work/tmpl-course/` — the builder
prefers it over the committed copy whenever
`work/tmpl-course/xl/worksheets/sheet3.xml` exists, and says so on stderr:

```bash
mkdir -p work/tmpl-course && unzip -q "Coursera Course Template.xlsx" -d work/tmpl-course
```

Sheet 3 is **FOR IMPORT**. Do not substitute a re-saved copy from Excel unless you have checked
that the *Ranges* sheet and the sheet-3 data validations survived — the builder reads both.

---

## 4. Run a course

Unzip the two source documents, then run the four stages. Using `genai-retail` as the example:

```bash
mkdir -p work/genai-retail
unzip -q "GenAI_Retail_Graded Quiz.docx" -d work/genai-retail/quiz
unzip -q "GenAI_Retail_Inventory_Course_Outline_V1.docx" -d work/genai-retail/outline
```

```bash
node src/genai-retail-parse-outline.js > work/genai-retail/outline.json
```

```bash
node src/genai-retail-parse-quiz.js > work/genai-retail/quiz.json
```

```bash
node src/genai-retail-build.js work/genai-retail/dist
```

```bash
node src/genai-retail-verify.js work/genai-retail/dist
```

A clean run ends with:

```
✅ ALL CHECKS PASSED — 2 files, 20 questions, 80 feedback blocks, references verified against the outline.
```

The `.docx` files in `work/genai-retail/dist/` are what you upload — one per module, via
**Import** on a Coursera quiz item.

### 4a. A course whose sources are one file per assessment

`deploying-ai-agents` ships seventeen separate assessment documents rather than one per
artefact type, so its extraction step differs: each source `.docx` becomes its own directory
under `work/<slug>/docs/`, named after the file, and the parsers classify them by reading their
headers. Everything downstream is the usual four stages, run once per family.

```bash
mkdir -p work/deploying-ai-agents/docs
unzip -q "Course_Syllabus_…_V1.docx" -d work/deploying-ai-agents/outline
find "05 - Assessments and Quizzes" -name '*.docx' | while read -r f; do
  unzip -q -o "$f" -d "work/deploying-ai-agents/docs/$(basename "$f" .docx)"
done
```

```bash
node src/deploying-ai-agents-parse-outline.js  > work/deploying-ai-agents/outline.json
node src/deploying-ai-agents-parse-quiz.js     > work/deploying-ai-agents/quiz.json
node src/deploying-ai-agents-parse-practice.js > work/deploying-ai-agents/practice.json
node src/deploying-ai-agents-parse-final.js    > work/deploying-ai-agents/final.json
```

```bash
node src/deploying-ai-agents-build.js          work/deploying-ai-agents/dist
node src/deploying-ai-agents-practice-build.js work/deploying-ai-agents/dist-practice
node src/deploying-ai-agents-final-build.js    work/deploying-ai-agents/dist-final
```

```bash
node src/deploying-ai-agents-verify.js          work/deploying-ai-agents/dist
node src/deploying-ai-agents-practice-verify.js work/deploying-ai-agents/dist-practice
node src/deploying-ai-agents-final-verify.js    work/deploying-ai-agents/dist-final
```

Its document assembly and its checks each live in one shared module —
`deploying-ai-agents-docbuild.js` and `deploying-ai-agents-docverify.js` — with three thin
entry points, because three copies of a four-hundred-line builder is how a fix lands in two of
them. Change the reference format in the builder and the verifier together.

This course has **no course-content import**: only the quiz documents were asked for.

### Available slugs

`osha` · `genai-marketing` · `genai-marketing-explanations` · `genai-retail` ·
`genai-appdev` · `management-mastery` · `pm-course-1` · `pm-course-2` · `pm-course-3` ·
`cstp-course-1` · `google-ads` · `google-ads-final` · `paid-social` · `paid-ads-11` ·
`ai-toolkit-v2` · `digital-marketing` · `shopify` · `websites-15` · `ai-products` ·
`soft-skills` · `digital-transformation` · `deploying-ai-agents`

`google-ads-final` is the rewritten assessment for the same course as `google-ads`, against the
same outline. It supersedes it: per-option explanations rather than one shared across four, a
spread answer key, a Bloom's level per question, and no duplicated question. Build from
`google-ads-final` unless you specifically need the earlier draft. The course-content `.xlsx`
is shared — the outline document is byte-identical, so there is nothing to rebuild.

### One ordering rule

Every quiz parser from `google-ads` onward reads `outline.json` — `google-ads` to resolve a
mapping stated as a video **title** (`Source video: …`) rather than as an `M<x>L<y>V<z>` code;
`paid-social`, `google-ads-final`, `ai-toolkit-v2`, `digital-marketing` and `shopify` to check
the title written beside each code against the outline's own; `paid-ads-11` to do the same and
then follow the title when the two disagree; and `websites-15` to resolve both a video title
and a lesson number, since 122 of its 150 questions name only a lesson. Run the outline parser
first — the order the run-through above already uses. If you skip it you get:

```
ENOENT work/google-ads/outline.json
This quiz states its mapping as a video title, so the outline must be parsed first:
  node src/google-ads-parse-outline.js > work/google-ads/outline.json
```

---

## 4b. Run a course-content import

Only the outline is needed. `genai-marketing` as the example:

```bash
mkdir -p work/genai-marketing
unzip -q "Outline - GenAI for Marketing.docx" -d work/genai-marketing/outline
```

```bash
node src/genai-marketing-parse-course.js --report
```

Read the warnings before going further — they name every duration the source left blank and
every item label the parser did not recognise. When they are understood:

```bash
node src/genai-marketing-parse-course.js > work/genai-marketing/course.json
```

`course.json` is meant to be edited. Module learning objectives in particular come straight
from the outline's aligned-objective line, which is usually one sentence; author richer ones
here rather than in the spreadsheet, so a rebuild does not discard them.

```bash
node src/course-import-build.js  genai-marketing
node src/course-import-verify.js genai-marketing
```

A clean run ends with:

```
✅ ALL CHECKS PASSED — GenAI for Marketing & Customer Engagement - Coursera Import.xlsx
   4 modules, 13 lessons, 61 items, 36 IVQs, 8h 6m, all types valid under "Private".
```

Upload the single `.xlsx` in `work/genai-marketing/dist/` via **Edit Content → Import** on the
course offering. It creates the outline and triggers uploads for any item that carries a
public link.

### Slugs with a course-content parser

`genai-marketing` · `cstp-course-1` · `management-mastery` · `ai-toolkit` · `google-ads` ·
`paid-social` · `paid-ads-11` · `ai-toolkit-v2` · `digital-marketing` · `shopify` · `websites-15` ·
`ai-products` · `soft-skills` · `digital-transformation` · `emotional-intelligence`

`ai-toolkit-v2` is the v2 outline of the course `ai-toolkit` reads at v1. Build from
`ai-toolkit-v2`; the older parser is kept only for the v1 document.

### The Dummies convention

`soft-skills` and `emotional-intelligence` are **Dummies** courses, not generic Starweaver ones,
and they are built to a different set of rules. The course owner states which courses these are;
do not infer it from the document. Where a Dummies course and the generic pipeline disagree, the
rules below win.

**Structure.** The two course-level tables become modules of their own rather than being folded
into lessons, so the outline's own modules shift up by one:

| Outline | Workbook |
|---|---|
| `Introduction to the Entire Course` | Module 1, one lesson holding its rows |
| `Module 1` … `Module 4` | Modules 2-5, unchanged |
| `Supplementary Items for the Entire Course` | a final module, `Course Wrap-Up and Next Steps` |

This renumbering is **course-content only**. The quiz pipeline's `M<x>L<y>V<z>` codes are written
against the outline's own numbering, so `soft-skills-parse-outline.js` keeps the original numbers
and must not be changed to match.

**Item types.** The course owner chooses what each item *is*. What the importer will *accept* is
not a choice — it is a closed list, established by upload and recorded below. Where the owner's
preferred name is not in that list, the row is mapped to the nearest accepted type and the item
name carries the intent; the true type has to be set in the Coursera UI afterwards.

| Outline label | Type written | | Outline label | Type written |
|---|---|---|---|---|
| Infographic / Reference Guide | Reading | | Hands-on Lab | Peer Review |
| Pre Course Diagnostic Guidance | Reading | | Roleplay | Peer Review † |
| Recommended Learning Path | Reading | | Course-end Project | Peer Review |
| The Part of Tens | Reading | | Coach Dialogue | Discussion Prompt † |
| Cheat Sheet | Reading | | Discussion Prompt | Discussion Prompt |
| Practice Quiz | Practice Assignment | | Graded Assessment | Assignment |
| Interactive Assessment | Practice Assignment | | | |

† A substitution, not the owner's name. `Roleplay` and `Dialogue` have been refused on three
uploads across two courses; the importer has no string for either concept, so no workbook can
create them.

Every string in that column has imported on a real upload. Three earlier revisions of this table
did not, and cost 17, 12 and 21 rows respectively.

**Import history.** The first upload of this workbook lost 17 of its 62 items, in two different
ways, and the difference matters:

| Type | Coursera returned | Reading |
|---|---|---|
| `Quiz` | *"Item type Quiz is not supported"* | the type was read and refused |
| `Quizzes`, `Dialogue`, `Roleplay` | `ITEM_TYPE_UNSET` / *"Invalid item type"* | **no type was read at all** |

Only `Quiz` is a verdict on the type. The rest are Coursera failing to recognise the string, and
the cells are written correctly — a refused cell is byte-identical in encoding and style to an
accepted one in the same upload.

**The importer's vocabulary is closed.** `emotional-intelligence` uploaded twice more, losing 12
rows and then 21, and the second pair settles it. The same nine cells went up in consecutive
uploads of a structurally identical workbook:

| Cells A41, A61, A71, A94, A104, A127, A137, A160, A170 | String | Result |
|---|---|---|
| upload 1 | `Practice Assignment` | **imported, 9 of 9** |
| upload 2 | `Practice Assessment` | **refused, 9 of 9** |

One word, same rows, same file structure. That rules out formatting, encoding, the dropdown and
row position: the match is exact-string against a fixed list. `Assignment` is in it, `Assessment`
is not — in any position. Three things that do **not** decide acceptance:

- the bundled template's Ranges list. `Practice Assignment` is absent from it and imports;
  `Graded Assessment` is equally absent and is refused.
- appending the type to Ranges. `course-import-build.js` does that and widens the dropdown, the
  file then opens cleanly in Excel and `course-import-verify.js` passes. Coursera ignores it.
- how close the name looks.

**Observed to import:** `Video`, `Reading`, `Discussion Prompt`, `Peer Review`, `Assignment`,
`Practice Assignment`.
**Observed to be refused:** `Quiz` (named), `Quizzes`, `Dialogue`, `Roleplay`,
`Graded Assignment`, `Practice Assessment`, `Graded Assessment` (all `ITEM_TYPE_UNSET`).

`emotional-intelligence-parse-course.js` holds these as `OBSERVED_IMPORTS` and
`OBSERVED_REFUSED` and checks every resolved type against them on each run: a refused string is
reported as a `REGRESSION` naming the rows it has already cost, and an unseen one as untested.
That check exists because the failure is silent — the build appends the type, the verifier passes,
and only the upload reveals the loss.

`Dialogue` and `Roleplay` have no accepted spelling. Both have been refused on three uploads
across two courses, so the importer has no string for either concept and no workbook can create
one. Either map them to an accepted type, as the table above does, or leave those rows out and
add the items by hand in Coursera.

**Three quiz pipelines, not one.** A Dummies course ships graded quizzes, per-lesson practice
quizzes and a pre-course diagnostic, each with its own parser, builder and verifier:

```bash
node src/soft-skills-parse-outline.js    > work/soft-skills/outline.json   # always first
node src/soft-skills-parse-quiz.js       > work/soft-skills/quiz.json
node src/soft-skills-parse-practice.js   > work/soft-skills/practice.json
node src/soft-skills-parse-diagnostic.js > work/soft-skills/diagnostic.json
node src/soft-skills-build.js            work/soft-skills/dist             # 4, one per module
node src/soft-skills-practice-build.js   work/soft-skills/dist-practice    # 8, one per lesson
node src/soft-skills-diagnostic-build.js work/soft-skills/dist-diagnostic  # 1
```

`emotional-intelligence` runs the same seven commands with its own slug. Its practice quiz is the
one place the two diverge: it writes a single combined `Module N, Lesson N: Title` heading where
`soft-skills` writes a module heading and a lesson heading as separate paragraphs, so neither of
the soft-skills header regexes matches it and the module title comes from the outline alone.

The diagnostic runs before any video is watched, so its feedback references the **module** a
question is drawn from rather than a video — `Refer to Module 1: <title>`. Its verifier checks
that form, not the `M<x>L<y>V<z>` one.

### One exception

The `osha` parsers predate the convention and take the XML path as an argument:

```bash
node src/osha-parse-quiz.js    work/osha/quiz/word/document.xml    > work/osha/quiz.json
node src/osha-parse-outline.js work/osha/outline/word/document.xml > work/osha/outline.json
```

Its build and verify steps are the same as everything else.

---

## 5. Inspect before you trust

`--report` prints question counts and warnings instead of JSON. This is the normal way to
work: iterate until warnings reach zero.

```bash
node src/pm-course-1-parse-quiz.js --report
```

```
Module 1 — Project Management Fundamentals: 10 questions
Module 2 — Setting Project Goals and Building WBS: 10 questions

warnings: 2
  M2 Q10: mapping absent in source, inferred as M2L3V3
  M3 Q10: mapping absent in source, inferred as M3L3V3
```

Warnings are not always defects — several flag deliberate inferences that need a human
decision. Read each one.

---

## 6. Adding a new course

Sources vary wildly, so a new course means a new parser. Budget most of your time here.

**The reference line is fixed, whatever the source looks like.** Every new course writes it
this way — module and lesson spelled out in full words, the asset kind carrying no number:

```
default:   Feedback: <explanation> (Refer to Module 1 Lesson 3 Video: Testing the Workflow as a Whole)

own-line:  Feedback: <explanation>
           Refer to Module 1 Lesson 3 Video: Testing the Workflow as a Whole
```

The own-line form is a separate, ZERO-SPACED paragraph directly under the feedback — never a
`<w:br/>`, and never with a blank paragraph between; see the rules table in §7. The choice is
per document, set in `OWN_LINE_BY_DEFAULT` / `OWN_LINE_EXCEPTIONS` in
`deploying-ai-agents-lib.js` — one definition that the builder and the verifier both read, so
they cannot drift. Today only one document is own-line: the `deploying-ai-agents` Module 1
Lesson 3 practice quiz, pending the course owner's review of the form.

`Reading:`, `Lab:` and `Discussion Prompt:` take the same shape when a question is written
from one of those rather than from a video; two items go in one bracket separated by `; `.
Standing instruction from the course owner as of 2026-09-25 — see `README.md`,
"The reference line".

**Label by the item type the learner sees.** An FAQ is published as a Reading, so it is
labelled `Reading:` and keeps its designation in the title:
`Reading: FAQ: When Two Agents Both Think They Own the Same Step`. A bare `FAQ:` label is
wrong. In `deploying-ai-agents` this is one row in `REFERENCE_AS` in the outline parser — add
a row there rather than special-casing a kind downstream.

Two things follow from it, and both have bitten already:

- **The builder and its verifier must change together.** The verifier re-derives the expected
  string independently rather than trusting the builder, which is the whole point of it. A
  one-sided edit fails loudly, which is correct — but only if you run it.
- **Do not retrofit delivered courses.** They keep the form they shipped with. Changing one
  means re-uploading it, which is the course owner's decision.

**Dump the source first.** Never guess at the layout:

```bash
node src/tool-extract-formatted.js work/<slug>/quiz/word/document.xml | head -60
```

This annotates bold, colour and paragraph styles, which is usually what distinguishes a
question header from a prompt.

**Check for hidden traps** before writing anything:

```bash
grep -c 'w:strike' work/<slug>/quiz/word/document.xml   # struck-through "cut" text
grep -c '<w:br'    work/<slug>/quiz/word/document.xml   # line breaks inside paragraphs
```

- Struck text present → use `lib-lines-strikeaware.js`, which drops it.
- Many `<w:br/>` → options are probably break-separated inside one paragraph; use
  `lib-lines.js`, which splits on them.

**Then copy the closest existing course** and adapt:

| Source shape | Start from |
|---|---|
| `Question N` + `A.` options + `Feedback:` block | `osha` |
| Bulleted options, no letters | `genai-marketing` |
| `Q1` + `Module Title:` / `Video:` metadata lines | `pm-course-2` |
| Mapping in the question header (`M1, L1, V1 – Title`) | `management-mastery` |
| One file per module | `cstp-course-1` |
| `Module N` / `Question N` headings, options as `A.` | `google-ads-final` |
| A scenario and its question in one `<w:br/>`-separated paragraph | `google-ads-final` |
| The verdict stated as a paragraph label, not inline | `google-ads-final` |
| One table per question, labels in column 1 | `google-ads` |
| Mapping stated as a video title, not a code | `google-ads` |
| A single explanation per question, not one per option | `google-ads` |
| Feedback rows carrying no letter, belonging to the option above | `paid-social` |
| Answer key stated after the question, not inside it | `paid-social` |
| Explanations opening `(Correct)` / `(Incorrect)` | `paid-social` |
| Mapping, key and prompt all inside the question's own table | `paid-ads-11` |
| A mapping stated twice, as a code and as a title | `paid-ads-11` |
| The answer key as a second paragraph inside the question cell | `ai-toolkit-v2` |
| `Q1.` headings, `A.` options, `A:` / `B (Correct):` explanations | `ai-products` |
| The key and the mapping on one line (`✅ Correct Answer: B     Mapped to: M1L1V1`) | `ai-products` |
| The scenario and the question as two separate paragraphs | `ai-products` |
| The scenario label on the question header (`Q1. Scenario:`), the scenario below it | `soft-skills` |
| Per-module files where module 1 is `<w:br/>`-formatted and the rest are not | `soft-skills` |
| Options whose letter is followed by a tab, a space, or nothing at all | `digital-transformation` |
| A practice quiz whose heading combines both numbers (`Module N, Lesson N: Title`) | `emotional-intelligence` |
| Per-module files differing only in paragraph style, not in line grammar | `emotional-intelligence` |
| A flat bullet outline — `Module N (Planned duration…)` / `Lesson N:` / `•Video: Title (7 mins)` — with no tables | `deploying-ai-agents` |
| Questions citing their source material by TITLE on an `Asset:` line, not by code | `deploying-ai-agents` |
| Questions citing a Reading, Lab, FAQ or Discussion Prompt rather than a video | `deploying-ai-agents` |
| The answer key implied only by the feedback verdict (`Correct.` / `Wrong.`), stars absent or partial | `deploying-ai-agents` |
| One file per lesson AND per module AND a course-wide final exam, seventeen in all | `deploying-ai-agents` |
| `Asset:` lines sitting ABOVE their question header in one file and below it in the rest | `deploying-ai-agents` |

### When a source states its mapping twice

`paid-ads-11` is the case to read before trusting any mapping. Its codes and its titles
disagree on 17 of 110 questions, and the codes are the stale side — they were written against
an earlier numbering of the same outline. The rule its `resolve()` applies, in order:

1. code and title agree → use the code;
2. exactly one video with that title **inside the question's own module** → use it, and report
   that the code was overruled;
3. only out-of-module matches → use the first, and report it loudly: a question with no video
   in its own module is a content gap, not a mapping to repair;
4. title unknown → keep the code and report.

Never let step 3 pass silently. Modules that share generic video names (`Search Terms`,
`Keyword Match Types`) will otherwise pull questions into the wrong module without a trace.

Point its `SP` paths at your slug, adjust the anchor and label regexes, and iterate with
`--report`. Then copy the matching `-build.js` and `-verify.js`, updating the two data paths
and the output filename.

### When the outline states no video number

`ai-products` is the case to read before trusting a mapping the outline did not write down.
Its learning-items table has no `Learning Items` column, so no row says `Video 1` — every
`M<x>L<y>V<z>` key is **derived** by counting video rows within the lesson. Two rules make the
derived numbers match what the quiz references, and both have to hold:

1. only a row whose `Video Format` is a production format (Talking Head, Conceptual, Demo)
   takes a number. Reading, Discussion, Activity/Exercise and Interactive rows sit in the same
   tables and must not consume one.
2. `Module Introduction` is **not** numbered. It is the row that makes the count come out
   right: 20 video rows, minus the two module introductions, is the 18 instructional videos
   Part 1 promises one IVQ each — and the quiz's own lowest reference in each lesson 1 is the
   row *after* the introduction.

Get rule 2 wrong and nothing fails. Every reference in each lesson 1 simply points one video
too early, which no verifier can catch because the mapping is still internally consistent. The
parser therefore reports the exclusion on every run rather than leaving it in a comment.

Check it the way it was checked here: the derived key count must equal the outline's own IVQ
claim, and `--report` on the quiz parser must show every question mapped inside its own module
with no unknown codes.

### When the reference is not a video

`deploying-ai-agents` is the case to read before assuming a feedback reference means a video.
Every earlier course cites a code (`Mapped to: M1L1V2`) that can only be a video, so a video
map was the whole of `outline.json`. This source cites a **title** on an `Asset:` line, and
28 of its 110 questions cite a Reading, a Lab, an FAQ or a Discussion Prompt instead:

```
Asset: Video: How Agents Pass Work to Each Other; Reading: A Coordination Patterns Reference
Asset: Lab: Map a Coordination Pattern
```

Its outline parser therefore indexes **every** learning item, not only the videos, and the
reference names whatever the source named:

```
(Refer to Module 1 Lesson 1 Video: Choosing a Coordination Pattern)
(Refer to Module 1 Lesson 1 Reading: A Coordination Patterns Reference for Multi-Agent Workflows)
(Refer to Module 1 Lesson 1 Video: <title>; Module 1 Lesson 1 Reading: <title>)
```

Forcing all of these into `Video` would send a quarter of the course's learners to material
that does not answer the question they got wrong, and nothing would fail — the reference would
still be well-formed. That is why the verifier checks the label against the outline's kind
rather than against a fixed `Video`. The V number is still derived, and still stored as the
asset `code`, but it does not reach the learner: the course owner asked for
`Module 1 Lesson 3 Video: <title>`, not `Video 3`.

Three further things this source settles, all of which are silent if you get them wrong:

1. **The star is not the key.** Ten of the seventeen files mark the correct option with `*`,
   two of them inconsistently (one stars 1 of 5, another 8 of 10). The verdict word opening
   each feedback is present on all 440 options. Key from the verdict, and report a star that
   disagrees rather than choosing between them.
2. **The verdict's punctuation is part of the pattern.** One explanation reads
   `Correct. Right signal and timing beat constant paging.` — matching a bare leading `Right`
   eats the first word of a sentence. Two others read `Wrong .Coordination patterns…`, space
   before the stop and none after — matching only `Wrong.` leaves a stray period in front of
   the learner. Require the punctuation; do not require the spacing.
3. **`Asset:` can sit above its question header.** Sixteen files put it below; the Module 4
   Lesson 3 practice quiz puts it above, for every question but its first. Read it
   positionally and every reference in that file shifts down by one while the last question
   silently loses its reference altogether.

### A course-content parser

Cheaper — only the parser is new, since `course-import-build.js` and `course-import-verify.js`
serve every course. Copy whichever existing `*-parse-course.js` matches the heading grammar:

| Outline shape | Start from |
|---|---|
| `Module N: Name` / `Lesson N: Name` headings | `genai-marketing` |
| Bare `Module N` + `Title of the Module:` on the next line | `cstp-course-1` |
| One document holding several courses | `cstp-course-1` (it stops at the next `Course N`) |
| Bare headings, `Description: ` labels, aligned objective as a bare `LO4` | `ai-toolkit` or `google-ads` |
| A learning-items table with **no `Learning Items` label column** | `ai-products` |
| A `Learning Items` column whose video rows are the bare word `Video`, unnumbered | `soft-skills` |
| Learning-items tables **nested inside other tables** | `digital-transformation` |

The item mapping, duration rules and block reader come from `lib-outline-course.js`, so a new
parser is usually just the heading regexes plus its own defaults for whatever the source
leaves blank. Iterate with `--report` until every warning is one you have decided about — a
blank duration is a real editorial choice, not noise to clear.

---

## 7. Import rules that bite

These caused real, silent import failures. The verifier now enforces all of them, but know
them before editing a builder.

| Rule | Symptom if broken |
|---|---|
| A prompt must not begin `Word:` | Coursera reads `Scenario: …` as an **answer option**. The question is rejected with a generic format error. |
| The prompt must be a single line | A second prompt paragraph is an unmatched line. |
| The video reference must be the `Feedback:` paragraph itself, or the paragraph **immediately** after it | A `Refer to …` paragraph anywhere else — after a blank line, or away from its feedback — rejects the question. |
| Never put a `<w:br/>` line break in a `Feedback:` paragraph | It imports, but Coursera renders it as several blank rows with stray spaces. To put the reference on its own line, use a separate paragraph (probe upload, 2026-09-28). |
| Guidance prose must not quote the marker strings | Coursera's own template says *"Imported content"* in prose and *"Importable content"* in the markers, deliberately. |
| Prompt length is fine | Coursera's reference prompt is ~800 characters — length is never the cause. |

If an import fails, Coursera returns a `processing_error` file naming the questions. Compare
the failures against the ones that succeeded — the difference is always structural, never
about the wording.

---

## 8. Troubleshooting

| Message | Cause |
|---|---|
| `ENOENT … work/tmpl/word/document.xml` | Assignment template not unzipped — see 3a. |
| `no course template: expected templates/…` | `templates/coursera-course-template.xlsx` was deleted. Restore it from git, or unzip your own into `work/tmpl-course/`. |
| `template has no xl/worksheets/sheet3.xml` | The template in `work/tmpl-course/` is not the Course Template, or was unzipped one level too deep. |
| `ENOENT … work/<slug>/quiz/word/document.xml` | Source `.docx` not unzipped, or wrong slug. |
| `Cannot find module … quiz.json` | Run the parse stages before build. |
| `N item name(s) shorter than 5 characters` | The build refuses to write a name Coursera would drop. Lengthen it in the outline, add a `NAME_FIXUPS` entry to the parser, or edit `course.json`. |
| Coursera returns `Item name is too short in cell B<n>` | An older workbook, built before that check existed. Rebuild it. Coursera keeps the rest of the upload and silently drops the named rows, so check the item count afterwards. |
| `item type "X" is not offered under "Public"` | `offeringType` in `course.json` disagrees with the item types used. Both are legal — pick one. |
| `WARN item types absent from the template's Ranges sheet` | Expected for `Roleplay`. The builder appends them and widens the dropdown. Only act on it if the name is a typo. |
| `item type "X" is not inside the dropdown range` | The Ranges sheet was extended but the validation range was not, or vice versa. Rebuild rather than hand-patching. |
| `lesson name "…" is not "Lesson N: Title"` | A hand edit to `course.json` broke the naming convention the verifier enforces. |
| `EBUSY` / `EPERM` on build | The target `.docx` is open in Word or WPS. Close it. |
| `no mapping in source` | The source omits it. Supply one explicitly in the parser's `MAPPING_FALLBACK`. |
| `line break inside import section` | A builder edit introduced `<w:br/>`. Keep the import section break-free. |
| `bold formatting inside import section` | Quiz content must be plain text. |

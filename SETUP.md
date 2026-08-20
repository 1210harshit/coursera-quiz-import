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
      practice/             practice assessment .docx, unzipped (only where a course has them)
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

### Available slugs

`osha` · `genai-marketing` · `genai-marketing-explanations` · `genai-retail` ·
`genai-appdev` · `management-mastery` · `pm-course-1` · `pm-course-2` · `pm-course-3` ·
`cstp-course-1` · `bridging-soft-skills`

### 4a. A course with practice quizzes

`bridging-soft-skills` ships four graded assessments and four practice files, one of each per
module, so it unzips into three places rather than two. The practice files hold two lesson-scoped
quizzes each and are split at their lesson headings.

```bash
mkdir -p work/bridging-soft-skills
unzip -q "Bridging the Soft Skills Gap_Course Outline_Final.docx" -d work/bridging-soft-skills/outline
```

```bash
for i in 1 2 3 4; do
  unzip -q "BridgingTheSoftSkillsGap_GradedQuiz_Module$i.docx"   -d work/bridging-soft-skills/quiz/m$i
  unzip -q "BridgingTheSoftSkillsGap_PracticeQuiz_Module$i.docx" -d work/bridging-soft-skills/practice/m$i
done
```

```bash
node src/bridging-soft-skills-parse-outline.js > work/bridging-soft-skills/outline.json
```

```bash
node src/bridging-soft-skills-parse-quiz.js > work/bridging-soft-skills/quiz.json
```

```bash
node src/bridging-soft-skills-build.js work/bridging-soft-skills/dist
```

```bash
node src/bridging-soft-skills-verify.js work/bridging-soft-skills/dist
```

A clean run ends with:

```
✅ ALL CHECKS PASSED — 12 files (4 graded, 8 practice), 56 questions, 224 feedback blocks, references verified against the outline.
```

Twelve documents: `Coursera_Import_Module_<n>_Graded_Quiz_…` for each module, and
`Coursera_Import_Module_<n>_Lesson_<l>_Practice_Quiz_…` for each lesson. Upload each via
**Import** on the matching Coursera quiz item — the graded ones on a graded quiz, the practice
ones on a practice quiz.

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

`genai-marketing` · `cstp-course-1` · `management-mastery` · `ai-toolkit` · `bridging-soft-skills`

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
| Uniform grammar, and the course also has practice quizzes | `bridging-soft-skills` |

Point its `SP` paths at your slug, adjust the anchor and label regexes, and iterate with
`--report`. Then copy the matching `-build.js` and `-verify.js`, updating the two data paths
and the output filename.

### A course-content parser

Cheaper — only the parser is new, since `course-import-build.js` and `course-import-verify.js`
serve every course. Copy whichever existing `*-parse-course.js` matches the heading grammar:

| Outline shape | Start from |
|---|---|
| `Module N: Name` / `Lesson N: Name` headings | `genai-marketing` |
| Bare `Module N` + `Title of the Module:` on the next line | `cstp-course-1` |
| One document holding several courses | `cstp-course-1` (it stops at the next `Course N`) |
| Per-lesson objectives, and `In-video question:` stated in the description | `bridging-soft-skills` |

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
| The video reference must stay **inside** the `Feedback:` paragraph | A free-standing `Refer to …` paragraph rejects the question. |
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
| `item type "X" is not offered under "Public"` | `offeringType` in `course.json` disagrees with the item types used. Both are legal — pick one. |
| `item type(s) the Coursera importer will reject: X` | `X` is not in the template's Ranges sheet, which is exactly the importer's accepted list. Remap it in `lib-outline-course.js` `itemType()`. Do **not** add it to the Ranges sheet — the importer does not read that sheet, and the row will be rejected at import with `Item type X is not supported` or `ITEM_TYPE_UNSET`. |
| `item type "X" is not inside the dropdown range` | The Ranges sheet was hand-edited. Rebuild rather than patching. |
| `lesson name "…" is not "Lesson N: Title"` | A hand edit to `course.json` broke the naming convention the verifier enforces. |
| `EBUSY` / `EPERM` on build | The target `.docx` is open in Word or WPS. Close it. |
| `no mapping in source` | The source omits it. Supply one explicitly in the parser's `MAPPING_FALLBACK`. |
| `practice lesson has no questions` | A practice file's lesson heading is followed by no `Q1.` anchor — usually a heading the parser split on that is not really a quiz section. |
| `mapped to …, outside its own lesson` | A practice question points at a video in a different lesson. Decide whether the mapping or the placement is wrong; the builder will still emit it. |
| `Passing Threshold is "80%", expected "0%"` | A quiz parsed as practice was built with graded settings, or the other way round. Check `kind` in `quiz.json`. |
| `line break inside import section` | A builder edit introduced `<w:br/>`. Keep the import section break-free. |
| `bold formatting inside import section` | Quiz content must be plain text. |

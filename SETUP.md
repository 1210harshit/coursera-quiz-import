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
  work/                     your data (ignored)
    tmpl/                   Coursera's import template, unzipped   <- required once
    <course-slug>/
      quiz/                 graded assessment .docx, unzipped
      outline/              course outline .docx, unzipped
      quiz.json             produced by parse-quiz
      outline.json          produced by parse-outline
      dist/                 produced by build — the files you upload
```

Override the root with `QUIZ_WORK` if you'd rather keep data elsewhere:

```bash
QUIZ_WORK=/path/to/data node src/osha-build.js /path/to/data/osha/dist
```

### 3a. The template (required, once)

Every builder clones Coursera's **Assignment Import Template** to inherit its styles, headers
and hyperlink relationships. Download it from Coursera (the *Import* dialog on any quiz links
to it), then unzip it into `work/tmpl/`:

```bash
mkdir -p work/tmpl && unzip -q "Coursera Assignment Import Template.docx" -d work/tmpl
```

`work/tmpl/word/document.xml` must exist. Without it every build fails immediately.

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
`cstp-course-1`

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

Point its `SP` paths at your slug, adjust the anchor and label regexes, and iterate with
`--report`. Then copy the matching `-build.js` and `-verify.js`, updating the two data paths
and the output filename.

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
| `ENOENT … work/tmpl/word/document.xml` | Template not unzipped — see 3a. |
| `ENOENT … work/<slug>/quiz/word/document.xml` | Source `.docx` not unzipped, or wrong slug. |
| `Cannot find module … quiz.json` | Run the parse stages before build. |
| `EBUSY` / `EPERM` on build | The target `.docx` is open in Word or WPS. Close it. |
| `no mapping in source` | The source omits it. Supply one explicitly in the parser's `MAPPING_FALLBACK`. |
| `line break inside import section` | A builder edit introduced `<w:br/>`. Keep the import section break-free. |
| `bold formatting inside import section` | Quiz content must be plain text. |

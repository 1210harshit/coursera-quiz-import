// Builder for the Deploying and Orchestrating AI Agents MODULE GRADED QUIZZES — one Coursera
// Assignment Import .docx per module, four in all.
//
//     node src/deploying-ai-agents-build.js work/deploying-ai-agents/dist
//
// Reads quiz.json and outline.json. The document assembly lives in
// deploying-ai-agents-docbuild.js, which the practice quizzes and the final exam share; what
// is here is what is specific to a module graded quiz — the scope sentences, the attempt
// policy the source sets (two attempts, 80% to pass) and the file names.
const fs = require('fs');
const path = require('path');
const { buildAll, SP } = require('./deploying-ai-agents-docbuild');
const { referenceStyle } = require('./deploying-ai-agents-lib');

const SLUG = 'deploying-ai-agents';
const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'quiz.json'), 'utf8'));
const { course, meta } = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'outline.json'), 'utf8'));

const specs = mods.map(quiz => {
  const nQ = quiz.questions.length;
  const nLessons = Object.keys(meta['M' + quiz.num].lessons).length;
  const pass = Math.ceil(nQ * 0.8);
  return {
    kind: 'graded',
    refStyle: referenceStyle('graded', quiz.num),
    quiz, course,
    shortName: `M${quiz.num} graded`,
    fileName: `Coursera_Import_Module_${quiz.num}_Graded_Quiz_Deploying_AI_Agents.docx`,
    heading: `${course.title} — Module ${quiz.num} Graded Quiz`,
    assignmentTitle: `Module ${quiz.num} Graded Quiz: ${quiz.moduleTitle}`,
    scopeText: `Module ${quiz.num}: ${quiz.moduleTitle}`,
    questionNoun: 'graded questions',
    importWhere: `To import, create a new quiz in Module ${quiz.num} of your Coursera course, click `,
    coreRows: [['Module', `Module ${quiz.num} — ${quiz.moduleTitle}`]],
    thresholdNote: [],
    thresholdFallback: '80%',
    instructionsOverview:
      `This graded quiz assesses your understanding of Module ${quiz.num}: ${quiz.moduleTitle}. `
      + `It contains ${nQ} multiple-choice questions drawn from all ${nLessons} lessons in the `
      + 'module. Select the single best answer for each question. Answer options are shuffled, so '
      + 'they may appear in a different order than a classmate sees. You need a score of 80% or '
      + `higher to pass, and you have ${quiz.settings.attempts || 'a limited number of'} attempts — `
      + 'your highest score is the one that counts. After you submit, you will see feedback on '
      + 'every option along with the specific course item to revisit.',
    reviewCriteria:
      `Each question is worth 1 point, for a total of ${nQ} points. All questions are auto-graded, `
      + 'so your score is available as soon as you submit. A score of 80% or higher '
      + `(${pass} of ${nQ}) is required to pass. Feedback is released immediately and includes an `
      + 'explanation for every option plus a reference to the video, reading or lab that covers it.',
    graderNote:
      `No manual grading is required. All ${nQ} questions are auto-graded multiple choice with a `
      + 'single correct answer worth 1 point each. The answer key and the course item referenced '
      + 'by each question are listed under “Working area for question design” at the end of this '
      + 'document.',
  };
});

buildAll(OUT, specs);

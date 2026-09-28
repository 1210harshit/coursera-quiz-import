// Builder for the Deploying and Orchestrating AI Agents LESSON PRACTICE QUIZZES — one Coursera
// Assignment Import .docx per lesson, twelve in all.
//
//     node src/deploying-ai-agents-practice-build.js work/deploying-ai-agents/dist-practice
//
// Reads practice.json and outline.json; the document assembly is shared with the graded
// quizzes and the final exam in deploying-ai-agents-docbuild.js.
//
// THE PASSING THRESHOLD IS THE SOURCE'S, not a blanket 0%. Earlier courses in this repo wrote
// 0% for every practice quiz because their sources set none. This source sets one on each of
// the twelve — "Passing threshold: 4" or "5" against five questions — so it is carried across
// as a percentage of the questions the document actually holds. It changes nothing about the
// learner's course grade, since a practice quiz does not count toward it, and it keeps the
// built document saying what the source says.
const fs = require('fs');
const path = require('path');
const { buildAll, SP } = require('./deploying-ai-agents-docbuild');
const { referenceStyle } = require('./deploying-ai-agents-lib');

const SLUG = 'deploying-ai-agents';
const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'practice.json'), 'utf8'));
const { course } = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'outline.json'), 'utf8'));

const specs = quizzes.map(quiz => {
  const nQ = quiz.questions.length;
  return {
    kind: 'practice',
    refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
    quiz, course,
    shortName: `M${quiz.num}L${quiz.lesson} practice`,
    fileName: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
      + 'Deploying_AI_Agents.docx',
    heading: `${course.title} — Module ${quiz.num} Lesson ${quiz.lesson} Practice Quiz`,
    assignmentTitle: `Module ${quiz.num} Lesson ${quiz.lesson} Practice Quiz: ${quiz.lessonTitle}`,
    scopeText: `Module ${quiz.num} Lesson ${quiz.lesson}: ${quiz.lessonTitle}`,
    questionNoun: 'practice questions',
    importWhere: `To import, create a new practice quiz in Module ${quiz.num}, Lesson `
      + `${quiz.lesson} of your Coursera course, click `,
    coreRows: [
      ['Module', `Module ${quiz.num} — ${quiz.moduleTitle}`],
      ['Lesson', `Lesson ${quiz.lesson} — ${quiz.lessonTitle}`],
    ],
    thresholdNote: ['Practice quiz — this does not count toward the course grade. The threshold '
      + 'below is the one the source assessment sets.'],
    thresholdFallback: '0%',
    instructionsOverview:
      `This practice quiz checks your understanding of Lesson ${quiz.lesson}: ${quiz.lessonTitle}. `
      + `It contains ${nQ} multiple-choice questions covering the lesson's videos, its reading and `
      + 'its lab. Select the single best answer for each question. Answer options are shuffled, so '
      + 'they may appear in a different order than a classmate sees. This quiz is practice: it '
      + 'does not count toward your course grade, and you may retake it as many times as you '
      + 'like. After you submit, you will see feedback on every option along with the specific '
      + 'course item to revisit. Use it before the module graded quiz rather than in place of it.',
    reviewCriteria:
      `All ${nQ} questions are auto-graded and the result is shown immediately. Nothing here `
      + 'contributes to the course grade — the quiz exists to give retrieval practice and to point '
      + 'you back at the right video, reading or lab while the lesson is still fresh. Feedback is '
      + 'released on every option, correct or not, with a reference to the item that covers it.',
    graderNote:
      `No manual grading is required. This is an ungraded practice quiz; all ${nQ} questions are `
      + 'auto-graded multiple choice with a single correct answer worth 1 point each. The answer '
      + 'key and the course item referenced by each question are listed under “Working area for '
      + 'question design” at the end of this document.',
  };
});

buildAll(OUT, specs);

// Builder for the Deploying and Orchestrating AI Agents FINAL EXAM — one Coursera Assignment
// Import .docx.
//
//     node src/deploying-ai-agents-final-build.js work/deploying-ai-agents/dist-final
//
// Reads final.json and outline.json; the document assembly is shared with the graded and
// practice quizzes in deploying-ai-agents-docbuild.js.
//
// The exam is graded and sits in Module 5 Lesson 1 beside the cumulative project, but it draws
// on Modules 1 to 4, so its scope sentence names the modules rather than the module it lives
// in. Its source sets unlimited attempts and a 7-of-10 threshold, both of which are carried
// across as written.
const fs = require('fs');
const path = require('path');
const { buildAll, SP } = require('./deploying-ai-agents-docbuild');
const { referenceStyle } = require('./deploying-ai-agents-lib');

const SLUG = 'deploying-ai-agents';
const OUT = process.argv[2];
const exams = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'final.json'), 'utf8'));
const { course } = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'outline.json'), 'utf8'));

const specs = exams.map(quiz => {
  const nQ = quiz.questions.length;
  const scope = quiz.scope.length
    ? `Modules ${quiz.scope.slice(0, -1).join(', ')} and ${quiz.scope.slice(-1)}`
    : 'the whole course';
  const threshold = String(quiz.settings.passingThreshold || '');
  const passText = /^(\d+)\s*\/\s*(\d+)$/.test(threshold)
    ? `${threshold.replace(/\s+/g, '')} (${Math.round(Number(threshold.split('/')[0]) / nQ * 100)}%)`
    : threshold || 'the passing score set for this exam';
  return {
    kind: 'final',
    refStyle: referenceStyle('final', quiz.num),
    quiz, course,
    shortName: 'final exam',
    fileName: 'Coursera_Import_Module_5_Final_Exam_Deploying_AI_Agents.docx',
    heading: `${course.title} — Final Exam`,
    assignmentTitle: `Final Exam: ${course.title}`,
    scopeText: `the final exam, covering ${scope}`,
    questionNoun: 'exam questions',
    importWhere: `To import, create a new quiz in Module ${quiz.num}, Lesson ${quiz.lesson} of `
      + 'your Coursera course, click ',
    coreRows: [
      ['Module', `Module ${quiz.num} — ${quiz.moduleTitle}`],
      ['Lesson', `Lesson ${quiz.lesson} — ${quiz.lessonTitle}`],
      ['Scope', `${scope} (course-wide)`],
    ],
    thresholdNote: [],
    thresholdFallback: '70%',
    instructionsOverview:
      `This final exam assesses the whole of ${course.title}. It contains ${nQ} multiple-choice `
      + `questions drawn from ${scope}, with every module represented. Select the single best `
      + 'answer for each question. Answer options are shuffled, so they may appear in a different '
      + `order than a classmate sees. You need ${passText} to pass, and your highest score is the `
      + 'one that counts. After you submit, you will see feedback on every option along with the '
      + 'specific course item to revisit.',
    reviewCriteria:
      `Each question is worth 1 point, for a total of ${nQ} points. All questions are auto-graded, `
      + `so your score is available as soon as you submit; ${passText} is required to pass. `
      + 'Feedback is released immediately and includes an explanation for every option plus a '
      + 'reference to the video, reading or lab that covers it, named by module and lesson so you '
      + 'can find it again across the whole course.',
    graderNote:
      `No manual grading is required. All ${nQ} questions are auto-graded multiple choice with a `
      + 'single correct answer worth 1 point each. The answer key and the course item referenced '
      + 'by each question are listed under “Working area for question design” at the end of this '
      + 'document, with the module each one comes from.',
  };
});

buildAll(OUT, specs);

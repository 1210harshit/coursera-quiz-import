// One command for the whole Managing pipeline: parse -> build -> verify, both quiz sets.
//
//   node src/managing-all.js            parse, build and verify everything
//   node src/managing-all.js --report   parser reports only; writes nothing
//
// Runs all six stages INSIDE THIS PROCESS rather than spawning them. Six `node` invocations
// cost about 30 ms each in interpreter startup on this machine — roughly a third of the old
// end-to-end time — and none of that bought anything, since the stages share no state that
// process isolation was protecting. Each stage is a plain CLI script, so it is driven the way
// the shell drove it: set process.argv, require it once, capture what it writes to stdout.
//
// Stage order is enforced and the run halts on the first failure, so a broken parse cannot
// leave a stale .docx in dist/ looking current.
const fs = require('fs');
const path = require('path');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const W = path.join(SP, 'managing');
const report = process.argv.includes('--report');
const t0 = Date.now();

// A stage that fails calls process.exit(); that must end the whole run, not just the stage,
// and the stage has already written its own diagnosis to stderr. Turn it into a throw so the
// remaining stages are skipped and the exit code survives.
class StageExit extends Error { constructor(code) { super('exit ' + code); this.code = code; } }

function runStage(script, args, captureTo) {
  const argv = process.argv;
  const log = console.log;
  const exit = process.exit;
  const out = [];
  process.argv = [argv[0], path.join(__dirname, script), ...args];
  if (captureTo) console.log = (...a) => out.push(a.join(' '));
  process.exit = code => { throw new StageExit(code || 0); };
  try {
    require(path.join(__dirname, script));
  } finally {
    process.argv = argv; console.log = log; process.exit = exit;
  }
  if (captureTo) fs.writeFileSync(captureTo, out.join('\n') + '\n');
}

const stages = report
  ? [['managing-parse-quiz.js', ['--report']], ['managing-parse-practice.js', ['--report']]]
  : [
      ['managing-parse-quiz.js',      [], path.join(W, 'quiz.json')],
      ['managing-parse-practice.js',  [], path.join(W, 'practice.json')],
      ['managing-build.js',           [path.join(W, 'dist')]],
      ['managing-practice-build.js',  [path.join(W, 'dist-practice')]],
      ['managing-verify.js',          [path.join(W, 'dist')]],
      ['managing-practice-verify.js', [path.join(W, 'dist-practice')]],
    ];

for (const [script, args, out] of stages) {
  const t = Date.now();
  try {
    runStage(script, args, out);
  } catch (err) {
    if (err instanceof StageExit && err.code !== 0) {
      console.error(`\n✗ ${script} exited ${err.code}. Nothing further was run.`);
      process.exit(err.code);
    }
    if (!(err instanceof StageExit)) {
      console.error(`\n✗ ${script} threw: ${err.message}\nNothing further was run.`);
      process.exit(1);
    }
  }
  if (out) console.log(`${script.padEnd(30)} -> ${path.basename(out)}  (${Date.now() - t} ms)`);
}
console.log(`\nTotal ${Date.now() - t0} ms`);

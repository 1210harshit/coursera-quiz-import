// DRAFTED ANSWER OPTIONS for the Business Process Automation Module 4 Lesson 1 practice quiz.
//
// ⚠ THIS FILE CONTAINS TEXT THAT IS NOT THE COURSE AUTHOR'S. Read the note below before
//   relying on it, and have an SME review it before the quiz is published.
//
// WHY IT EXISTS. The source file — "Practice Quiz - M4L1.docx" — carries the SAME option text
// in all four slots of all five questions: option B, the key, pasted over A, C and D. Coursera
// refuses every question with "Duplicate answers are not allowed", twice confirmed by upload.
// The raw XML has no tracked changes, no hidden runs and no content controls; each option is a
// single text run in its own paragraph. The original distractors are not in the file in any
// recoverable form.
//
// WHAT IS RECONSTRUCTED AND WHAT IS INVENTED. The two are different, and the difference matters:
//
//   * options C and D are RECONSTRUCTED. Their feedback survived intact and states what each
//     one claimed — "It does not violate security rules", "Visual formatting density and
//     subjective testimonials are vendor-hype traps", "Eliminating checkpoints creates
//     over-automation risks". The option is written to be the claim its own feedback rebuts,
//     so the pair reads as the author wrote it.
//   * option A is INVENTED, in both halves. Its feedback was damaged by the same paste — it
//     reads "This is the correct description, but this option is not marked as correct" and
//     similar — so there was nothing to reconstruct from. A new distractor and a new
//     explanation are written together, in the register of the surrounding four.
//
// Option B is NEVER touched: it is the key and it survived.
//
// This is an override applied at parse time rather than an edit to the .docx, so the source
// stays exactly as delivered, every substitution is listed on each parser run, and replacing
// this file with the author's own text is a deletion rather than a merge.
//
// TO RETIRE THIS FILE: when a corrected source arrives, drop it into work/bpa-course-1/docs/,
// delete this module and the two lines that require and apply it in
// bpa-course-1-parse-practice.js. Nothing else depends on it.

module.exports = {
  // Which document these belong to, in the parser's own document key.
  document: 'practice:M4L1',
  source: 'Practice Quiz - M4L1',

  questions: {
    1: {
      // "…primary risk of moving a step from a human to a bot swimlane unchanged?"
      A: {
        invented: true,
        text: 'It removes the data-entry inefficiencies automatically, because a bot performs '
          + 'the same step faster and more consistently than a human clerk.',
        feedback: 'Speed is not the same as improvement. Running an unchanged step faster '
          + 'preserves the data-entry inefficiencies rather than removing them, which is what '
          + 'makes the redesign cosmetic.',
      },
      C: {
        text: 'It violates security rules, because an RPA bot cannot be granted access to the '
          + 'account-status records held in the system of record.',
      },
      D: {
        text: 'It forces an immediate decommission of the legacy billing system, because the '
          + "bot's firewall permissions block the existing data format.",
      },
    },

    2: {
      // "…how does a BA demonstrate a future-state design is superior to the baseline?"
      A: {
        invented: true,
        text: 'By showing that the future-state design uses more automation technology than the '
          + 'current state does.',
        feedback: 'Counting automation steps is not evidence of improvement. Superiority is '
          + 'shown by tracing specific improvement levers to the current-state bottlenecks they '
          + 'remove, not by how much technology appears in the design.',
      },
      C: {
        text: 'By relabelling the swimlane headings and adding extra complexity lanes so the '
          + 'future-state diagram looks more thorough than the baseline.',
      },
      D: {
        text: 'By producing a denser, more polished diagram and collecting testimonials from '
          + "the vendor's reference customers.",
      },
    },

    3: {
      // "…primary error in measuring 'digital onboarding invitations sent per day'?"
      A: {
        invented: true,
        text: 'It measures a step the AI assistant does not control, so the number will always '
          + 'be inaccurate.',
        feedback: 'Accuracy is not the problem — a count of invitations sent is perfectly '
          + 'reliable. The problem is that it measures activity rather than the business '
          + 'outcome the redesign was meant to deliver.',
      },
      C: {
        text: 'It is a qualitative metric that cannot be measured reliably enough to report to '
          + 'stakeholders.',
      },
      D: {
        text: 'There is no error; invitation volume is exactly the outcome measure a CFO needs '
          + 'in order to authorise continued funding.',
      },
    },

    4: {
      // "…critical requirement under Explainability & Transparency?"
      A: {
        invented: true,
        text: "The assistant's model weights and training data must be published to every "
          + 'client who submits a service request.',
        feedback: 'Explainability is about tracing a specific output back to its source '
          + 'documents, not disclosing model internals. Publishing weights or training data '
          + 'would breach confidentiality without making any single recommendation auditable.',
      },
      C: {
        text: 'The assistant must be allowed to run autonomously without human checkpoints, '
          + 'bypassing database firewalls so that its reasoning is never interrupted.',
      },
      D: {
        text: 'The assistant must process requests blindly on unvalidated data, so that no '
          + 'human bias enters the extraction.',
      },
    },

    5: {
      // "…how should human-in-the-loop checkpoints be structured for variable email scans?"
      A: {
        invented: true,
        text: 'Remove the human checkpoints and let the assistant process every scan, since '
          + 'variable inputs make confidence scores unreliable anyway.',
        feedback: 'Removing the checkpoints is the over-automation failure the canvas exists to '
          + 'prevent. Variable inputs are the reason a confidence threshold is needed, not a '
          + 'reason to discard it.',
      },
      C: {
        text: 'Place a mandatory human validation gate after every single step in the workflow, '
          + 'so that nothing reaches the customer unchecked.',
      },
      D: {
        text: 'Delay the design until IT can build custom code that reads every scan format '
          + 'perfectly, then remove the human checks entirely.',
      },
    },
  },
};

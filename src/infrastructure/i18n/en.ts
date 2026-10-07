const en = {
  trainer: {
    heading: 'Name the note',
    staffLabel: 'Music staff',
    staffLoadError: "Couldn't load the staff. Reload the page.",
    check: 'Check',
    next: 'Next',
    correct: 'Correct',
    incorrect: 'Incorrect',
    chooseNoteNameFirst: 'Choose a note name first',
    openNextAutomatically: 'Open next question automatically',
  },
  session: {
    chooseLength: 'How many questions?',
    unlimited: 'No limit',
    questionOf: 'Question {number} of {length}',
    question: 'Question {number}',
    toResults: 'Results',
    finish: 'Finish',
    correctOf: 'Correct: {correct} of {checked}',
    streak: 'Streak: {count}',
  },
  results: {
    heading: 'Results',
    accuracy: 'Accuracy: {percent}% ({correct} of {checked})',
    questions: 'Questions: {count}',
    bestStreak: 'Best streak: {count}',
    newSession: 'New session',
  },
}

export type Messages = typeof en

export default en

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
    incorrectTryAgain: 'Incorrect. Try again.',
    correctOnSecondTry: 'Correct on the second try',
    review: 'You chose {chosen}. This is {expected}: the note {place}.',
    place: {
      ledgerLineBelow1: 'on the first ledger line below the staff',
      belowStaff: 'just below the staff',
      line1: 'on the 1st line',
      line2: 'on the 2nd line',
      line3: 'on the 3rd line',
      space1: 'in the 1st space',
      space2: 'in the 2nd space',
      space3: 'in the 3rd space',
    },
  },
  session: {
    chooseLength: 'How many questions?',
    unlimited: 'No limit',
    showAnswerAtOnce: 'Show the right answer at once',
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
    averageTime: 'Average time: {seconds}\u00A0s',
    newSession: 'New session',
  },
  preferences: {
    language: 'Language',
    noteNaming: 'Note names',
    seventhNote: 'Seventh note',
    notSaved: "Settings won't be saved in this browser.",
  },
}

export type Messages = typeof en

export default en

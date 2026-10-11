export {
  createTrainer,
  hasOpenNoteAfter,
  hasOpenNoteBefore,
  isNoteMarked,
  isNoteOpen,
} from './trainer'
export type { ChosenAlteration, NoteChoice, Outcome, Trainer, TrainerState } from './trainer'
export { createWritingTrainer } from './writing-trainer'
export type {
  WritingHint,
  WritingTrainer,
  WritingTrainerState,
  WrittenChoice,
} from './writing-trainer'

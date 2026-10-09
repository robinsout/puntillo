import type { Messages } from './en'

export default {
  trainer: {
    heading: 'Назовите ноту',
    staffLabel: 'Нотоносец',
    staffLoadError: 'Не удалось загрузить нотоносец. Перезагрузите страницу.',
    check: 'Проверить',
    next: 'Далее',
    correct: 'Верно',
    incorrect: 'Неверно',
    chooseNoteNameFirst: 'Сначала выберите название ноты',
    openNextAutomatically: 'Автоматически открывать следующий вопрос',
    incorrectTryAgain: 'Неверно. Попробуйте ещё раз.',
    correctOnSecondTry: 'Верно со второй попытки',
    review: 'Вы выбрали {chosen}. Это {expected} — нота {place}.',
    place: {
      ledgerLineBelow1: 'на первой добавочной линейке снизу',
      belowStaff: 'под нотоносцем',
      line1: 'на первой линейке',
      line2: 'на второй линейке',
      line3: 'на третьей линейке',
      space1: 'в первом промежутке',
      space2: 'во втором промежутке',
      space3: 'в третьем промежутке',
    },
  },
  session: {
    chooseLength: 'Сколько вопросов?',
    unlimited: 'Без ограничения',
    showAnswerAtOnce: 'Сразу показывать правильный ответ',
    questionOf: 'Вопрос {number} из {length}',
    question: 'Вопрос {number}',
    toResults: 'Результаты',
    finish: 'Завершить',
    correctOf: 'Верно: {correct} из {checked}',
    streak: 'Серия: {count}',
  },
  results: {
    heading: 'Результаты',
    // Non-breaking space so that % never wraps apart from the number.
    accuracy: 'Точность: {percent}\u00A0% ({correct} из {checked})',
    questions: 'Вопросов: {count}',
    bestStreak: 'Лучшая серия: {count}',
    averageTime: 'Среднее время: {seconds}\u00A0с',
    newSession: 'Новая сессия',
  },
  preferences: {
    language: 'Язык',
    noteNaming: 'Названия нот',
    seventhNote: 'Седьмая ступень',
  },
} satisfies Messages

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
  },
  session: {
    chooseLength: 'Сколько вопросов?',
    unlimited: 'Без ограничения',
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
} satisfies Messages

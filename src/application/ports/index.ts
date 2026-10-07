// Источник случайности: next() возвращает число в [0, 1).
export interface Random {
  next(): number
}

// Отложенный запуск: schedule(ms, task) запускает task через ms миллисекунд
// и возвращает функцию отмены.
export interface Scheduler {
  schedule(ms: number, task: () => void): () => void
}

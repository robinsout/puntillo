// next() returns a number in [0, 1).
export interface Random {
  next(): number
}

// Returns a function that cancels the task.
export interface Scheduler {
  schedule(ms: number, task: () => void): () => void
}

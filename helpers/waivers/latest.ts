// Run async loads so only the most recent one may touch state. Switching
// league while the first load is still downloading must not let the older
// response (or its error, or its spinner reset) land on top of the newer one.

export interface LatestHandlers<T> {
  onValue: (value: T) => void
  onError: (error: Error) => void
  onSettled: () => void
}

export function latestOnly() {
  let current = 0
  return function run<T>(promise: Promise<T>, handlers: LatestHandlers<T>): Promise<void> {
    const id = ++current
    return promise.then(
      (value) => {
        if (id !== current) return
        handlers.onValue(value)
        handlers.onSettled()
      },
      (error: Error) => {
        if (id !== current) return
        handlers.onError(error)
        handlers.onSettled()
      }
    )
  }
}

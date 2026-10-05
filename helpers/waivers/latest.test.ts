import { describe, expect, it } from 'vitest'
import { latestOnly } from './latest'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

describe('latestOnly', () => {
  it('ignores a slower earlier request that resolves after a newer one', async () => {
    const run = latestOnly()
    const seen: string[] = []
    const lads = deferred<string>()
    const flexi = deferred<string>()
    const a = run(lads.promise, { onValue: (v) => seen.push(v), onError: () => seen.push('err'), onSettled: () => seen.push('settled-lads') })
    const b = run(flexi.promise, { onValue: (v) => seen.push(v), onError: () => seen.push('err'), onSettled: () => seen.push('settled-flexi') })
    flexi.resolve('flexi')
    await b
    lads.resolve('lads')
    await a
    expect(seen).toEqual(['flexi', 'settled-flexi'])
  })

  it('ignores a stale error too', async () => {
    const run = latestOnly()
    const seen: string[] = []
    const old = deferred<string>()
    const a = run(old.promise, { onValue: () => {}, onError: (e) => seen.push(e.message), onSettled: () => {} })
    const b = run(Promise.resolve('new'), { onValue: (v) => seen.push(v), onError: () => {}, onSettled: () => {} })
    await b
    old.reject(new Error('stale'))
    await a
    expect(seen).toEqual(['new'])
  })
})

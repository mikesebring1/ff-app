export function createScoreFlashController({
  durationMs,
  now = () => Date.now(),
  onChange = () => {},
  setTimeoutFn = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeoutFn = (timer) => globalThis.clearTimeout(timer),
}) {
  let activeChanges = new Map()
  let nextSequence = 0
  const timers = new Map()

  function publish() {
    onChange(new Map(activeChanges))
  }

  function clear({ notify = true } = {}) {
    for (const timer of timers.values()) {
      clearTimeoutFn(timer)
    }
    timers.clear()

    const hadChanges = activeChanges.size > 0
    activeChanges = new Map()
    if (notify && hadChanges) publish()
  }

  function add(change, identity) {
    const existingTimer = timers.get(change.key)
    if (existingTimer !== undefined) clearTimeoutFn(existingTimer)

    nextSequence += 1
    const sequence = nextSequence
    activeChanges.set(change.key, {
      ...change,
      expiresAt: now() + durationMs,
      identity: String(identity),
      sequence,
    })

    const timer = setTimeoutFn(() => {
      const current = activeChanges.get(change.key)
      if (current?.sequence !== sequence) return

      timers.delete(change.key)
      activeChanges.delete(change.key)
      publish()
    }, durationMs)
    timers.set(change.key, timer)
  }

  return {
    update({ animationsEnabled, changes, identity, reset }) {
      if (reset || !animationsEnabled) {
        clear()
        return
      }

      if (changes.length === 0) return
      for (const change of changes) add(change, identity)
      publish()
    },

    dispose() {
      clear({ notify: false })
    },

    snapshot() {
      return new Map(activeChanges)
    },
  }
}

export function createSleeperRequestCounter() {
  let requests = []

  return {
    record(request) {
      requests.push({ ...request, requestedAt: new Date().toISOString() })
    },
    reset() {
      requests = []
    },
    snapshot() {
      const byResource = Object.create(null)
      const byQuery = Object.create(null)

      for (const request of requests) {
        byResource[request.resource] = (byResource[request.resource] ?? 0) + 1
        const query = request.queryKey ?? request.path
        byQuery[query] = (byQuery[query] ?? 0) + 1
      }

      return {
        total: requests.length,
        byResource: { ...byResource },
        byQuery: { ...byQuery },
        requests: requests.map((request) => ({ ...request })),
      }
    },
  }
}

const developmentCounter = createSleeperRequestCounter()
const isDevelopment = import.meta.env?.DEV === true

if (isDevelopment) {
  globalThis.__FF_SLEEPER_REQUESTS__ = {
    reset: () => developmentCounter.reset(),
    snapshot: () => developmentCounter.snapshot(),
  }
}

export function recordSleeperRequest(request) {
  if (isDevelopment) {
    developmentCounter.record(request)
  }
}

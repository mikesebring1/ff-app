import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useTeamSummary } from '../hooks/useTeamSummary'
import { teamSummaryCooldownSeconds } from '../lib/team-summary'

function SummaryList({ items }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No items identified.</p>

  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function cooldownLabel(seconds) {
  if (seconds <= 0) return 'Regenerate'
  if (seconds >= 60 * 60) {
    const hours = Math.ceil(seconds / (60 * 60))
    return `Regenerate in ${hours}h`
  }
  const minutes = Math.ceil(seconds / 60)
  return `Regenerate in ${minutes}m`
}

export default function TeamSummary({ rosterId }) {
  const [now, setNow] = useState(() => Date.now())
  const {
    data,
    error,
    isLoading,
    isRegenerating,
    refetch,
    regenerate,
    regenerateError,
  } = useTeamSummary(rosterId)
  const cooldownSeconds = teamSummaryCooldownSeconds(data, now)

  useEffect(() => {
    if (!data || cooldownSeconds <= 0) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [cooldownSeconds, data])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground sm:p-6">
          <Sparkles className="h-5 w-5 animate-pulse text-primary" aria-hidden="true" />
          Analyzing roster identity, strengths, and opportunities...
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-semibold">Team summary unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message || 'The roster could not be analyzed right now.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    )
  }

  const { summary } = data
  const actionError = regenerateError?.message

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="relative">
          <div className="flex items-center gap-2 pr-10">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Team summary</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {summary.identity}
          </p>
          <button
            type="button"
            onClick={() => regenerate()}
            disabled={isRegenerating || cooldownSeconds > 0}
            aria-label={isRegenerating ? 'Regenerating team summary' : cooldownLabel(cooldownSeconds)}
            title={isRegenerating ? 'Regenerating team summary' : cooldownLabel(cooldownSeconds)}
            className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {actionError && <p className="text-sm text-red-500">{actionError}</p>}

        <div className="grid gap-5 sm:grid-cols-2">
          <section>
            <h3 className="mb-3 text-sm font-semibold">Strengths</h3>
            <SummaryList items={summary.strengths} />
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold">Gaps</h3>
            <SummaryList items={summary.gaps} />
          </section>
        </div>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Potential targets</h3>
          </div>
          {summary.targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projected free-agent upgrades were identified this week.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {summary.targets.map((target) => (
                <div key={target.player_id} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{target.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {target.position} · {target.nfl_team}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {Number(target.projected_points || 0).toFixed(1)} pts
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {target.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Improvement plan</h3>
          <SummaryList items={summary.strategy} />
        </section>

        <p className="border-t pt-4 text-xs text-muted-foreground">
          AI-generated from current league rosters, standings, and Week projections. Verify advice before making roster moves.
        </p>
      </CardContent>
    </Card>
  )
}

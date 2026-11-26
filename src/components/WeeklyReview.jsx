import { Sparkles } from 'lucide-react'
import { useWeeklyReview } from '../hooks/useWeeklyReview'

function formatPoints(value) {
  return Number(value).toFixed(2)
}

function TeamRecap({ team }) {
  return (
    <article className="rounded-2xl border bg-card p-4 sm:p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold tabular-nums text-muted-foreground">
            {team.rank}
          </span>
          <div className="min-w-0">
            <h4 className="truncate font-semibold tracking-tight">{team.teamName}</h4>
            <p className="text-xs text-muted-foreground">
              {team.record} vs everyone
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatPoints(team.points)} pts
        </span>
      </header>

      <p className="mt-4 border-l-2 border-primary pl-3 text-sm font-medium leading-relaxed">
        {team.verdict}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section>
          <h5 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Performance
          </h5>
          <p className="mt-1.5 text-sm leading-relaxed">{team.performance}</p>
        </section>
        <section>
          <h5 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Lineup calls
          </h5>
          <p className="mt-1.5 text-sm leading-relaxed">{team.lineup}</p>
        </section>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-1">
          {team.lineupEfficiency.toFixed(1)}% lineup efficiency
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1">
          {formatPoints(team.pointsLeftOnBench)} points left on bench
        </span>
      </div>
    </article>
  )
}

export default function WeeklyReview({ isCompleted, week }) {
  const { data, error, isLoading, refetch } = useWeeklyReview(week, {
    enabled: isCompleted,
  })

  if (!isCompleted) {
    return (
      <div className="rounded-2xl border border-dashed px-5 py-10 text-center">
        <h3 className="font-semibold">Review pending</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Week {week || '—'} needs to finish before the league gets reviewed.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border px-5 py-10 text-sm text-muted-foreground">
        <Sparkles className="h-5 w-5 animate-pulse text-primary" aria-hidden="true" />
        Writing the Week {week} review...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border px-5 py-8 text-center">
        <h3 className="font-semibold">Weekly review unavailable</h3>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {error?.message || 'The review could not be loaded right now.'}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-muted/20 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Week {data.week} review
        </div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
          {data.review.headline}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {data.review.overview}
        </p>
      </section>

      <div className="space-y-3">
        {data.review.teams.map((team) => (
          <TeamRecap key={team.rosterId} team={team} />
        ))}
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Generated once from finalized scores and lineup decisions. Commentary is AI-generated; the numbers are not.
      </p>
    </div>
  )
}

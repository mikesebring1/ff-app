import { Trophy } from 'lucide-react'
import { useOverallStandings } from '../hooks/useOverallStandings'
import { buildPostseasonPreview } from '../lib/postseason'

function PreviewTeam({ team, selectedRosterId, onRosterSelect }) {
  const selected = selectedRosterId === String(team.id)

  return (
    <button
      type="button"
      onClick={() => onRosterSelect?.(String(team.id))}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent/60 ${selected ? 'bg-accent ring-2 ring-primary/60' : ''}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {team.seed}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {team.teamName}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {team.overallRecord}
      </span>
    </button>
  )
}

export default function PostseasonPreview({
  onRosterSelect,
  openingWeek,
  selectedRosterId,
  week,
}) {
  const { data: standings = [], isLoading, error } = useOverallStandings()
  const preview = buildPostseasonPreview(standings)

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading postseason preview...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-500">
        Unable to load the postseason preview
      </div>
    )
  }

  return (
    <section aria-labelledby="postseason-preview-title" className="space-y-5 pb-2">
      <div className="text-center">
        <div className="mb-1 flex items-center justify-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-500" aria-hidden="true" />
          <h2 id="postseason-preview-title" className="text-lg font-semibold">
            Week {week} Postseason Preview
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">If the season ended today</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-muted/20 p-3">
          <h3 className="mb-2 px-2 text-sm font-semibold">Championship field</h3>
          <div className="space-y-1">
            {preview.playoffTeams.map((team) => (
              <PreviewTeam
                key={team.id}
                team={team}
                selectedRosterId={selectedRosterId}
                onRosterSelect={onRosterSelect}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/20 p-3">
          <h3 className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold">
            <span aria-hidden="true">🚽</span>
            Toilet Bowl field
          </h3>
          <div className="space-y-1">
            {preview.toiletBowlTeams.map((team) => (
              <PreviewTeam
                key={team.id}
                team={team}
                selectedRosterId={selectedRosterId}
                onRosterSelect={onRosterSelect}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {week === openingWeek
          ? 'The field remains provisional until the regular season ends.'
          : `Week ${openingWeek} scores will determine the final-round matchups.`}
      </p>
    </section>
  )
}

import { Medal, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { useOverallStandings } from '../hooks/useOverallStandings'
import { useWeeklyStandings } from '../hooks/useWeeklyStandings'
import {
  buildChampionshipPostseason,
  buildToiletBowl,
  comparePostseasonTeams,
  getRegularSeasonStandingsStatus,
  isPostseasonWeekComplete,
} from '../lib/postseason'

function formatScore(score) {
  return score === null || score === undefined ? '--' : Number(score).toFixed(2)
}

function StatusPill({ status }) {
  const labels = {
    blocked: 'Needs ruling',
    complete: 'Final',
    live: 'Live',
    missing: 'Score unavailable',
    pending: 'Waiting',
    pregame: 'Not started',
    unresolved: 'Needs ruling',
  }
  const styles = status === 'live'
    ? 'bg-green-500/15 text-green-700 dark:text-green-300'
    : status === 'unresolved' || status === 'blocked'
      ? 'bg-red-500/15 text-red-700 dark:text-red-300'
      : 'bg-muted text-muted-foreground'

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
      {labels[status] ?? status}
    </span>
  )
}

function TeamRow({ label, onRosterSelect, selectedRosterId, showProjection = true, team }) {
  const selected = selectedRosterId === String(team.id)

  return (
    <button
      type="button"
      onClick={() => onRosterSelect?.(String(team.id))}
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/60 ${selected ? 'bg-accent ring-2 ring-primary/60' : ''}`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {team.seed}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{team.teamName}</span>
        <span className="block text-xs text-muted-foreground">
          {label ?? `${team.wins} regular-season wins`}
        </span>
      </span>
      <span className="text-right">
        <span className="block font-mono text-base font-bold tabular-nums">
          {formatScore(team.score)}
        </span>
        {showProjection && team.projectedPoints !== null && (
          <span className="block text-xs text-muted-foreground">
            proj. {Number(team.projectedPoints).toFixed(1)}
          </span>
        )}
      </span>
    </button>
  )
}

function PoolRound({ boundaryLabel, onRosterSelect, round, selectedRosterId }) {
  return (
    <div className="space-y-1">
      {round.teams.map((team, index) => (
        <div key={team.id}>
          {index === round.advanceCount && boundaryLabel && (
            <div className="my-2 flex items-center gap-3" aria-label={boundaryLabel}>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                {boundaryLabel}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          <TeamRow
            team={team}
            selectedRosterId={selectedRosterId}
            onRosterSelect={onRosterSelect}
          />
        </div>
      ))}
    </div>
  )
}

function RulingRequired({ children }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
      {children} The score, regular-season record, and season points are all tied, so a manual ruling is required.
    </div>
  )
}

function MatchupCard({ icon, match, onRosterSelect, selectedRosterId, title, winnerLabel }) {
  const exactLiveTie = match.status === 'live'
    && match.teams.length === 2
    && comparePostseasonTeams(match.teams[0], match.teams[1]) === 0

  return (
    <div className="rounded-2xl border bg-muted/10 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          <h3>{title}</h3>
        </div>
        <StatusPill status={match.status} />
      </div>
      {match.status === 'unresolved' && (
        <div className="mb-3">
          <RulingRequired>This matchup is still tied after every automatic tiebreaker.</RulingRequired>
        </div>
      )}
      <div className="space-y-1">
        {match.teams.map((team, index) => {
          let label
          if (match.status === 'complete' && index === 0) label = winnerLabel
          if (match.status === 'live' && index === 0 && !exactLiveTie) label = 'Live leader'
          return (
            <TeamRow
              key={team.id}
              team={team}
              label={label}
              selectedRosterId={selectedRosterId}
              onRosterSelect={onRosterSelect}
            />
          )
        })}
      </div>
    </div>
  )
}

function ChampionshipCard({ championship, finalWeek, onRosterSelect, openingWeek, selectedRosterId, viewWeek }) {
  const openingRound = championship.qualifyingRound

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-500" aria-hidden="true" />
              Championship Playoffs
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {viewWeek === openingWeek
                ? `Week ${openingWeek}: the top two scorers reach the championship.`
                : `Week ${finalWeek}: championship and third-place games.`}
            </p>
          </div>
          {viewWeek === openingWeek && <StatusPill status={openingRound.status} />}
        </div>
      </CardHeader>
      <CardContent>
        {viewWeek === openingWeek ? (
          <>
            {openingRound.status === 'unresolved' && (
              <div className="mb-3">
                <RulingRequired>The Week {openingWeek} advancement cutoff is tied.</RulingRequired>
              </div>
            )}
            <PoolRound
              round={openingRound}
              boundaryLabel={openingRound.status === 'live' || openingRound.status === 'complete' || openingRound.status === 'unresolved'
                ? 'Championship · Third place'
                : null}
              selectedRosterId={selectedRosterId}
              onRosterSelect={onRosterSelect}
            />
          </>
        ) : openingRound.status === 'unresolved' ? (
          <RulingRequired>The Week {openingWeek} advancement cutoff is tied.</RulingRequired>
        ) : openingRound.status !== 'complete' ? (
          <div className="rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            Waiting for the Week {openingWeek} field to be finalized.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <MatchupCard
              title="Championship"
              winnerLabel="Champion"
              icon={<Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-500" aria-hidden="true" />}
              match={championship.championship}
              selectedRosterId={selectedRosterId}
              onRosterSelect={onRosterSelect}
            />
            <MatchupCard
              title="Third Place"
              winnerLabel="Third place"
              icon={<Medal className="h-4 w-4 text-orange-600 dark:text-orange-500" aria-hidden="true" />}
              match={championship.thirdPlace}
              selectedRosterId={selectedRosterId}
              onRosterSelect={onRosterSelect}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CumulativeToiletBowl({ onRosterSelect, round, selectedRosterId, openingWeek, finalWeek }) {
  return (
    <>
      {round.status === 'unresolved' && (
        <div className="mb-3">
          <RulingRequired>The two-week cumulative matchup is tied.</RulingRequired>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Team</span>
          <span>W{openingWeek}</span>
          <span>W{finalWeek}</span>
          <span>Total</span>
        </div>
        {round.teams.map((team) => {
          const selected = selectedRosterId === String(team.id)
          const isLast = round.status === 'complete' && round.lastPlace?.id === team.id
          return (
            <button
              type="button"
              key={team.id}
              onClick={() => onRosterSelect?.(String(team.id))}
              className={`grid w-full grid-cols-[minmax(0,1fr)_repeat(3,auto)] items-center gap-3 border-b px-3 py-3 text-left text-sm last:border-b-0 hover:bg-accent/60 ${selected ? 'bg-accent' : ''}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{team.teamName}</span>
                {isLast && <span className="block text-xs text-red-600 dark:text-red-400">Last place</span>}
              </span>
              <span className="font-mono tabular-nums">{formatScore(team.week16Score)}</span>
              <span className="font-mono tabular-nums">{formatScore(team.week17Score)}</span>
              <span className="font-mono font-bold tabular-nums">{formatScore(team.score)}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function ToiletBowlCard({ finalWeek, onRosterSelect, openingWeek, selectedRosterId, toiletBowl, viewWeek }) {
  let body

  if (toiletBowl.format === 'none') {
    body = <p className="rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">No teams qualified for the Toilet Bowl.</p>
  } else if (toiletBowl.format === 'automatic') {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">No other team finished within nine wins, so no Toilet Bowl games are played.</p>
        <TeamRow
          team={{ ...toiletBowl.lastPlace, score: null }}
          label="Automatic last place"
          showProjection={false}
          selectedRosterId={selectedRosterId}
          onRosterSelect={onRosterSelect}
        />
      </div>
    )
  } else if (toiletBowl.format === 'cumulative') {
    body = (
      <CumulativeToiletBowl
        round={toiletBowl.cumulativeRound}
        openingWeek={openingWeek}
        finalWeek={finalWeek}
        selectedRosterId={selectedRosterId}
        onRosterSelect={onRosterSelect}
      />
    )
  } else if (viewWeek === openingWeek) {
    body = (
      <>
        {toiletBowl.qualifyingRound.status === 'unresolved' && (
          <div className="mb-3"><RulingRequired>The Week {openingWeek} escape cutoff is tied.</RulingRequired></div>
        )}
        <PoolRound
          round={toiletBowl.qualifyingRound}
          boundaryLabel={toiletBowl.qualifyingRound.status === 'live'
            || toiletBowl.qualifyingRound.status === 'complete'
            || toiletBowl.qualifyingRound.status === 'unresolved'
            ? 'Escape · Flushed'
            : null}
          selectedRosterId={selectedRosterId}
          onRosterSelect={onRosterSelect}
        />
      </>
    )
  } else if (toiletBowl.qualifyingRound.status === 'unresolved') {
    body = <RulingRequired>The Week {openingWeek} escape cutoff is tied.</RulingRequired>
  } else if (toiletBowl.finalRound.status === 'pending') {
    body = <p className="rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">Waiting for the Week {openingWeek} field to be finalized.</p>
  } else {
    const displayRound = {
      ...toiletBowl.finalRound,
      advanceCount: Math.max(toiletBowl.finalRound.teams.length - 1, 0),
    }
    body = (
      <>
        {toiletBowl.finalRound.status === 'unresolved' && (
          <div className="mb-3"><RulingRequired>The Week {finalWeek} last-place score is tied.</RulingRequired></div>
        )}
        <PoolRound
          round={displayRound}
          boundaryLabel={toiletBowl.finalRound.status === 'live'
            || toiletBowl.finalRound.status === 'complete'
            || toiletBowl.finalRound.status === 'unresolved'
            ? 'Safe · Last place'
            : null}
          selectedRosterId={selectedRosterId}
          onRosterSelect={onRosterSelect}
        />
      </>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><span aria-hidden="true">🚽</span>Toilet Bowl</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {toiletBowl.format === 'cumulative'
                ? `Weeks ${openingWeek}–${finalWeek}: lower cumulative score finishes last.`
                : viewWeek === openingWeek
                  ? `Week ${openingWeek}: the top half escapes.`
                  : `Week ${finalWeek}: the lowest score finishes last.`}
            </p>
          </div>
          {toiletBowl.format !== 'automatic' && toiletBowl.format !== 'none' && (
            <StatusPill status={toiletBowl.format === 'elimination' && viewWeek === openingWeek
              ? toiletBowl.qualifyingRound.status
              : toiletBowl.status}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

export default function PlayoffBracket({ onRosterSelect, selectedRosterId }) {
  const {
    currentWeek,
    displayWeek,
    leagueStatus,
    playoffWeekStart: openingWeek,
    postseasonFinalWeek: finalWeek,
    totalRosters,
  } = useCurrentWeek()
  const {
    data: overallStandings = [],
    isFetching: overallFetching,
    isLoading: overallLoading,
    error: overallError,
  } = useOverallStandings({ monitorPostseason: true })
  const regularSeasonStatus = getRegularSeasonStandingsStatus({
    standings: overallStandings,
    playoffWeekStart: openingWeek,
    totalRosters,
  })
  const openingQuery = useWeeklyStandings(String(openingWeek), {
    enabled: regularSeasonStatus.complete,
  })
  const finalQueryEnabled = regularSeasonStatus.complete
    && (currentWeek >= finalWeek || displayWeek >= finalWeek)
  const finalQuery = useWeeklyStandings(String(finalWeek), { enabled: finalQueryEnabled })
  const openingComplete = isPostseasonWeekComplete({ week: openingWeek, currentWeek, displayWeek, leagueStatus })
  const finalComplete = isPostseasonWeekComplete({ week: finalWeek, currentWeek, displayWeek, leagueStatus })
  const viewWeek = displayWeek >= finalWeek ? finalWeek : openingWeek
  const championship = buildChampionshipPostseason({
    standings: overallStandings,
    week16Results: openingQuery.data,
    week17Results: finalQuery.data,
    week16Complete: openingComplete,
    week17Complete: finalComplete,
  })
  const toiletBowl = buildToiletBowl({
    standings: overallStandings,
    week16Results: openingQuery.data,
    week17Results: finalQuery.data,
    week16Complete: openingComplete,
    week17Complete: finalComplete,
  })
  const loading = overallLoading
    || (regularSeasonStatus.complete && openingQuery.isLoading)
    || (finalQueryEnabled && finalQuery.isLoading)
  const error = overallError || openingQuery.error || (finalQueryEnabled && finalQuery.error)

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
        <p className="mt-2">Loading postseason...</p>
      </div>
    )
  }
  if (overallError) return <div className="py-12 text-center text-red-500">Failed to load final regular-season standings</div>
  if (!regularSeasonStatus.complete) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xl" aria-hidden="true">
            ⏳
          </div>
          <h2 className="text-lg font-semibold">Final regular-season standings are processing</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Week {openingWeek - 1} must be finalized before the postseason field can be set. This page will refresh automatically.
          </p>
          {overallFetching && (
            <p className="mt-3 text-xs text-muted-foreground">Checking for the final standings...</p>
          )}
        </CardContent>
      </Card>
    )
  }
  if (error) return <div className="py-12 text-center text-red-500">Failed to load postseason data</div>

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Week {viewWeek} Postseason</h2>
        <p className="mt-1 text-sm text-muted-foreground">Regular-season record, then season points, break scoring ties.</p>
      </div>
      <ChampionshipCard
        championship={championship}
        openingWeek={openingWeek}
        finalWeek={finalWeek}
        viewWeek={viewWeek}
        selectedRosterId={selectedRosterId}
        onRosterSelect={onRosterSelect}
      />
      <ToiletBowlCard
        toiletBowl={toiletBowl}
        openingWeek={openingWeek}
        finalWeek={finalWeek}
        viewWeek={viewWeek}
        selectedRosterId={selectedRosterId}
        onRosterSelect={onRosterSelect}
      />
    </div>
  )
}

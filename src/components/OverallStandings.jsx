import { useMemo, useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import OverallStandingsChart from './OverallStandingsChart'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { useLeagueContext } from '../hooks/useLeagueContext'
import { useOverallStandings } from '../hooks/useOverallStandings'
import { useWeeklyStandings } from '../hooks/useWeeklyStandings'
import { buildLiveOverallStandings } from '../lib/live-overall-standings'
import { findToiletBowlQualifierIds } from '../lib/toilet-bowl'

export default function OverallStandings({ selectedRosterId, onRosterSelect, onTeamOpen }) {
  const [liveSelection, setLiveSelection] = useState({ key: null, enabled: false })
  const { data: leagueContext } = useLeagueContext()
  const {
    currentWeek,
    displayWeek,
    totalRosters,
    playoffWeekStart,
  } = useCurrentWeek()
  const {
    data: overallStandings = [],
    isLoading: overallLoading,
    error: overallError,
  } = useOverallStandings()
  const displayWeekNumber = Number(displayWeek)
  const liveWeekEligible = Number.isInteger(displayWeekNumber)
    && displayWeekNumber > 0
    && displayWeekNumber === Number(currentWeek)
    && displayWeekNumber < playoffWeekStart
  const {
    data: weeklyStandings = [],
    isLoading: weeklyLoading,
    error: weeklyError,
    weekStarted,
  } = useWeeklyStandings(String(displayWeek ?? ''), {
    enabled: liveWeekEligible,
    suppressUnstartedStandings: true,
  })
  const liveKey = `${leagueContext?.season ?? ''}:${leagueContext?.league_id ?? ''}:${displayWeek ?? ''}`
  const liveEnabled = liveSelection.key === liveKey && liveSelection.enabled
  const liveReady = !overallLoading
    && !overallError
    && !weeklyLoading
    && !weeklyError
    && weekStarted
    && weeklyStandings.length === Number(totalRosters)
  const displayedStandings = useMemo(
    () => liveEnabled && liveReady
      ? buildLiveOverallStandings(overallStandings, weeklyStandings)
      : overallStandings,
    [liveEnabled, liveReady, overallStandings, weeklyStandings],
  )
  const toiletBowlQualifierIds = findToiletBowlQualifierIds(displayedStandings)
  const liveDisabled = !liveEnabled && !liveReady

  const toggleLive = () => {
    setLiveSelection({ key: liveKey, enabled: !liveEnabled })
  }

  // Highlight selected team with background
  const getHighlightStyle = (rosterId) => {
    if (selectedRosterId == null || selectedRosterId !== String(rosterId)) {
      return "hover:bg-accent/50"
    }
    
    return "bg-accent/100"
  }

  return (
    <div>
      {liveWeekEligible && (
        <div className="mb-3 flex justify-end px-1">
          <button
            type="button"
            role="switch"
            aria-checked={liveEnabled}
            disabled={liveDisabled}
            onClick={toggleLive}
            title={!liveReady && !liveEnabled
              ? (weeklyError?.message || 'Live standings are available after scoring begins')
              : undefined}
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-sm font-medium">Live</span>
            <span
              aria-hidden="true"
              className={`relative h-6 w-11 rounded-full transition-colors ${liveEnabled ? 'bg-lime-500' : 'bg-input'}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${liveEnabled ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        </div>
      )}
      <Card className="overflow-hidden">
        <CardContent className="px-3 pt-5 sm:px-6 sm:pt-7">
          <div className="mb-6 px-1 sm:px-2">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Overall standings</h2>
          </div>
          {/* Column Headers */}
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center border-b px-2 py-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground sm:px-4">
            <div>
              <span className="sr-only">Toilet Bowl status</span>
            </div>
            <div className="min-w-0">
              <span>Team</span>
            </div>
            <div className="flex gap-4 sm:gap-8">
              <span>Points</span>
              <span>Playoff %</span>
            </div>
          </div>

          {overallLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span>Loading overall standings...</span>
              </div>
            </div>
          )}

          {overallError && (
            <div className="text-center py-8 text-red-500">
              <div className="flex flex-col items-center gap-2">
                <span className="font-medium">{overallError?.message || 'Failed to load data'}</span>
                <button
                  onClick={() => window.location.reload()}
                  className="text-sm text-blue-500 hover:text-blue-700 underline"
                >
                  Tap to retry
                </button>
              </div>
            </div>
          )}

          {!overallLoading && !overallError && (
            <div className="space-y-0">
              {displayedStandings.map((team, index) => (
                <div
                  key={team.id}
                  className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center border-b px-2 py-4 transition-colors last:border-b-0 sm:px-4 ${index === 4 ? 'border-t-4 border-t-foreground' : ''} ${getHighlightStyle(team.id)}`}
                >
                  <div className="flex items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
                      {team.rank}
                    </span>
                    {toiletBowlQualifierIds.has(String(team.id)) && (
                      <span
                        className="-ml-2 -mt-7 text-xs"
                        role="img"
                        aria-label="Currently qualifies for the Toilet Bowl"
                        title="Currently qualifies for the Toilet Bowl"
                      >
                        🚽
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div>
                      <button
                        type="button"
                        onClick={() => onTeamOpen?.(String(team.id))}
                        className="block max-w-full truncate rounded text-left text-sm font-semibold tracking-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {team.teamName}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {team.overallRecord}, {team.earnings}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm font-semibold tabular-nums sm:gap-8">
                    <span className="text-foreground">{team.totalPoints}</span>
                    <span className="w-16 text-center">{team.playoffPct}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <OverallStandingsChart
        selectedRosterId={selectedRosterId}
        onRosterSelect={onRosterSelect}
      />
    </div>
  )
}

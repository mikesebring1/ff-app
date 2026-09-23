import { useState, useEffect, useMemo } from 'react'
import { LayoutGroup, motion as Motion, MotionConfig, useReducedMotion } from 'motion/react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown } from "lucide-react"
import WeeklyStandingsChart from './WeeklyStandingsChart'
import PregameCrystalBall from './PregameCrystalBall'
import { useAvailableWeeks, useWeeklyStandings } from '../hooks/useWeeklyStandings'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { useLivePlayerScoreChanges } from '../hooks/useScoreAnimation'
import { buildRankLayout, playerScoreKey } from '../lib/live-score-changes'
import { isPregameEligibleWeek, resolveSelectedWeek } from '../lib/week-selection'


function TeamScore({ points, projectedTotal }) {
  return (
    <div className="font-medium rounded px-1">
      <span className="text-primary">{points}</span>
      {projectedTotal && parseFloat(projectedTotal) > 0 && (
        <span className="text-xs text-gray-400 ml-1">/{projectedTotal}</span>
      )}
    </div>
  )
}

function PlayerScore({ change, points, placeholderForZero = false }) {
  const score = Number(points)
  const displayScore = placeholderForZero && score === 0
    ? '--'
    : score.toFixed(2)
  const flashClass = change?.direction === 'increase'
    ? 'player-score-flash-increase'
    : change?.direction === 'decrease'
      ? 'player-score-flash-decrease'
      : ''

  return (
    <span
      key={change?.sequence ?? 'stable'}
      className={`${flashClass} inline-block rounded px-1 -mr-1`}
    >
      {displayScore}
    </span>
  )
}

export default function WeeklyStandings({ selectedRosterId, onRosterSelect }) {
  const [openItems, setOpenItems] = useState([])
  const [weekSelection, setWeekSelection] = useState({
    isManual: false,
    week: '',
  })
  const selectedWeek = weekSelection.week
  
  const { displayWeek } = useCurrentWeek()
  const isPregameEligible = isPregameEligibleWeek({ selectedWeek, displayWeek })
  
  // Use React Query hooks
  const { data: availableWeeks = [], isLoading: weeksLoading, error: weeksError } = useAvailableWeeks()
  const { 
    data: weeklyStandings = [], 
    isLoading: standingsLoading, 
    error: standingsError,
    dataUpdatedAt,
    isLivePolling,
    matchupIdentity,
    matchupSnapshot,
    pregameTeams,
    weekStarted,
  } = useWeeklyStandings(selectedWeek, {
    suppressUnstartedStandings: isPregameEligible,
  })
  const reducedMotion = useReducedMotion()
  const showPregame = isPregameEligible && !weekStarted
  const playerScoreChanges = useLivePlayerScoreChanges({
    animationsEnabled: !reducedMotion,
    identity: matchupIdentity,
    isLive: isLivePolling && weekStarted,
    matchups: matchupSnapshot,
    snapshotToken: dataUpdatedAt,
  })
  const rankLayout = useMemo(
    () => buildRankLayout(weeklyStandings),
    [weeklyStandings],
  )
  const rankLayoutByRoster = useMemo(
    () => new Map(rankLayout.map((entry) => [entry.rosterId, entry])),
    [rankLayout],
  )
  const getPlayerScoreChange = (rosterId, playerId) => {
    if (!isLivePolling) return undefined

    const change = playerScoreChanges.get(playerScoreKey(rosterId, playerId))
    return change?.identity === matchupIdentity ? change : undefined
  }

  // Follow Sleeper's display week until the user deliberately picks a week.
  useEffect(() => {
    setWeekSelection((currentSelection) => {
      const nextWeek = resolveSelectedWeek({
        selectedWeek: currentSelection.week,
        displayWeek,
        availableWeeks,
        selectionIsManual: currentSelection.isManual,
      })

      return nextWeek === currentSelection.week
        ? currentSelection
        : { ...currentSelection, week: nextWeek }
    })
  }, [availableWeeks, displayWeek])

  
  const loading = weeksLoading || standingsLoading
  const error = weeksError || standingsError

  // Highlight selected team with background
  const getHighlightStyle = (rosterId) => {
    if (selectedRosterId == null || selectedRosterId !== String(rosterId)) {
      return {}
    }
    
    return {
      className: "bg-accent/100"
    }
  }

  return (
    <div>
      <Card>
        <CardContent className="pt-3 sm:pt-6">
          {/* Week Selector */}
          <div className="flex justify-center mb-4">
            <Select
              value={selectedWeek}
              onValueChange={(week) => setWeekSelection({ isManual: true, week })}
              disabled={loading || availableWeeks.length === 0}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={loading ? "Loading..." : availableWeeks.length === 0 ? "No weeks" : "Select week"} />
              </SelectTrigger>
              <SelectContent>
                {availableWeeks.map((week) => (
                  <SelectItem key={week} value={String(week)}>
                    Week {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-Refresh Toggle */}
          {isLivePolling && (
            <div className="flex flex-col items-center mb-3 sm:mb-6">
              <div className="flex items-center gap-2">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-lime-500"></span>
                </div>
                <span className="text-sm text-muted-foreground">Auto-refreshing...</span>
              </div>
              {dataUpdatedAt ? (
                <span className="text-xs text-muted-foreground/60 mt-1">
                  Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          )}

          {!loading && !error && showPregame ? (
            <PregameCrystalBall
              onRosterSelect={onRosterSelect}
              reducedMotion={reducedMotion}
              selectedRosterId={selectedRosterId}
              teams={pregameTeams}
              week={selectedWeek}
            />
          ) : (
            <div className="flex justify-between items-center py-2 border-b font-medium text-sm text-muted-foreground">
              <div className="flex items-center gap-2 pl-10">
                <span>Team</span>
              </div>
              <div className="pr-4">
                <span>Points</span>
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-primary"></div>
                <span>Loading weekly standings...</span>
              </div>
            </div>
          )}
          
          {error && (
            <div className="text-center py-8 text-red-500">
              <div className="flex flex-col items-center gap-2">
                <span className="font-medium">{error?.message || 'Failed to load data'}</span>
                <button 
                  onClick={() => window.location.reload()} 
                  className="text-sm text-blue-500 hover:text-blue-700 underline"
                >
                  Tap to retry
                </button>
              </div>
            </div>
          )}
          
          {!loading && !error && !showPregame && (
            <MotionConfig reducedMotion="user">
              <LayoutGroup id={`weekly-standings-${matchupIdentity ?? selectedWeek}`}>
                <Accordion
                  key={matchupIdentity ?? selectedWeek}
                  type="multiple"
                  className="w-full"
                  value={openItems}
                  onValueChange={setOpenItems}
                >
                  {weeklyStandings.map((team) => {
                    const highlight = getHighlightStyle(team.id)
                    const rankEntry = rankLayoutByRoster.get(String(team.id))
                    return (
                      <Motion.div
                        key={team.id}
                        layout={isLivePolling ? 'position' : false}
                        layoutDependency={`${rankEntry?.rank}:${rankEntry?.order}`}
                        initial={false}
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      >
                        <AccordionItem value={team.id} className={highlight.className || ""}>
                          <AccordionTrigger className="px-2 sm:px-4 hover:no-underline [&>svg]:hidden">
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2">
                                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${openItems.includes(team.id) ? 'rotate-180' : ''}`} />
                                <div>
                                  <div className="font-medium">
                                    {team.rank} - {team.teamName}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {team.record}
                                  </div>
                                </div>
                              </div>
                              <TeamScore
                                points={team.points}
                                projectedTotal={team.projectedTotal}
                              />
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="px-2 sm:px-4 pb-2 sm:pb-4">
                              <div className="bg-muted rounded-lg p-2 sm:p-4">
                                {team.starters && team.starters.length > 0 ? (
                                  <>
                                    {/* Starters List */}
                                    <div className="space-y-1 border-b pb-2 mb-2">
                                      {team.starters.map((player) => (
                                        <div key={player.player_id} className="py-1">
                                          <div className="flex justify-between items-center text-xs sm:text-sm">
                                            <div className="flex items-center">
                                              <span className="font-medium text-muted-foreground w-8 sm:w-10 inline-block">
                                                {player.lineup_position}
                                              </span>
                                              <span>{player.player}</span>
                                            </div>
                                            <div className="font-medium">
                                              <PlayerScore
                                                points={player.points}
                                                change={getPlayerScoreChange(team.id, player.player_id)}
                                              />
                                            </div>
                                          </div>
                                          <div className="flex justify-between items-center text-xs sm:text-sm text-muted-foreground ml-8 sm:ml-10">
                                            <span>{player.team}</span>
                                            <span>{parseFloat(player.projected_points || 0).toFixed(1)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Bench Players List */}
                                    {team.benchPlayers && team.benchPlayers.length > 0 && (
                                      <div className="space-y-1">
                                        {team.benchPlayers.map((player) => {
                                          const actualPoints = parseFloat(player.points || 0)

                                          return (
                                            <div key={player.player_id} className="py-1 opacity-75">
                                              <div className="flex justify-between items-center text-xs sm:text-sm">
                                                <div className="flex items-center">
                                                  <span className="font-medium text-muted-foreground w-8 sm:w-10 inline-block">
                                                    {player.position}
                                                  </span>
                                                  <span>{player.player}</span>
                                                </div>
                                                <div className="text-muted-foreground">
                                                  <PlayerScore
                                                    points={actualPoints}
                                                    placeholderForZero
                                                    change={getPlayerScoreChange(team.id, player.player_id)}
                                                  />
                                                </div>
                                              </div>
                                              <div className="flex justify-between items-center text-xs sm:text-sm text-muted-foreground ml-8 sm:ml-10">
                                                <span>{player.team}</span>
                                                <span>{parseFloat(player.projected_points || 0).toFixed(1)}</span>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-center text-muted-foreground text-sm py-4">
                                    Roster data not available
                                  </div>
                                )}
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Motion.div>
                    )
                  })}
                </Accordion>
              </LayoutGroup>
            </MotionConfig>
          )}
        </CardContent>
      </Card>
      
      <WeeklyStandingsChart
        selectedRosterId={selectedRosterId}
        onRosterSelect={onRosterSelect}
      />
    </div>
  )
}

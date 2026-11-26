import { useState } from 'react'
import { ArrowLeft, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useTeamRoster } from '../hooks/useTeamRoster'
import TeamSummary from './TeamSummary'

function RosterSection({ players, showProjectedPoints = false, title }) {
  if (players.length === 0) return null

  return (
    <section aria-labelledby={`roster-${title.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2
          id={`roster-${title.toLowerCase().replaceAll(' ', '-')}`}
          className="text-sm font-semibold"
        >
          {title}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{players.length}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {players.map((player) => (
          <div
            key={player.id}
            className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-3 last:border-b-0 sm:px-4"
          >
            <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-muted px-1 text-xs font-bold text-muted-foreground">
              {player.position}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{player.name}</span>
              {showProjectedPoints && (
                <span className="block text-xs text-muted-foreground">{player.nflTeam}</span>
              )}
            </span>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {showProjectedPoints
                ? `${player.projectedPoints.toFixed(1)} pts`
                : player.nflTeam}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function TeamPage({ rosterId, onBack }) {
  const [activeTab, setActiveTab] = useState('roster')
  const { data: team, isLoading, error } = useTeamRoster(rosterId)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      {isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            <span>Loading team roster...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center text-red-500">
            {error.message || 'Unable to load the team roster'}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && !team && (
        <Card>
          <CardContent className="py-12 text-center">
            <h1 className="text-xl font-semibold">Team not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This roster is not part of the active league.
            </p>
          </CardContent>
        </Card>
      )}

      {team && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-4 p-5 sm:p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{team.teamName}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[team.ownerName, `${team.playerCount} players`].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <div
                role="tablist"
                aria-label="Team details"
                className="grid grid-cols-2 border-t bg-muted/20 p-1"
              >
                {[
                  { id: 'roster', label: 'Roster' },
                  { id: 'insights', label: 'Insights' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`team-${tab.id}-tab`}
                    aria-controls={`team-${tab.id}-panel`}
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-10 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      activeTab === tab.id
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {activeTab === 'insights' ? (
            <div
              role="tabpanel"
              id="team-insights-panel"
              aria-labelledby="team-insights-tab"
            >
              <TeamSummary rosterId={team.id} />
            </div>
          ) : (
            <div
              role="tabpanel"
              id="team-roster-panel"
              aria-labelledby="team-roster-tab"
            >
              {team.playerCount === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No players are currently assigned to this roster.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  <RosterSection
                    title="Starting lineup"
                    players={team.starters}
                    showProjectedPoints
                  />
                  <RosterSection title="Bench" players={team.bench} showProjectedPoints />
                  <RosterSection title="Injured reserve" players={team.reserve} />
                  <RosterSection title="Taxi squad" players={team.taxi} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

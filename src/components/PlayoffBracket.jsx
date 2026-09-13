import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy, Medal } from "lucide-react"
import { useWeeklyStandings } from '../hooks/useWeeklyStandings'
import { useOverallStandings } from '../hooks/useOverallStandings'
import { useSleeperPlayers } from '../hooks/useSleeper'


function PlayoffTeamScore({ points }) {
  return (
    <div className="text-xl font-bold mt-1 rounded px-2">
      {points.toFixed(2)}
    </div>
  )
}

export default function PlayoffBracket({ week, selectedTeam }) {
  const isSemiFinals = week === "16"
  const isFinals = week === "17"
  
  // Check if Week 17 is complete (Tuesday or later, or no active games)
  const isWeek17Complete = () => {
    if (!isFinals) return false
    
    const now = new Date()
    const day = now.getDay() // 0 = Sunday, 1 = Monday, 2 = Tuesday
    
    // If it's Tuesday or later, Week 17 is complete
    if (day >= 2) return true
    
    // If it's Monday after 11:59 PM EST (games are over)
    if (day === 1) {
      const hour = now.getHours()
      return hour >= 24 // This would never be true, but Monday games end before midnight
    }
    
    // Otherwise, Week 17 is not complete
    return false
  }
  
  const week17Complete = isWeek17Complete()
  
  // Get overall standings to determine playoff seeds
  const { data: overallStandings = [] } = useOverallStandings()
  
  // Get weekly results for the playoff week
  const {
    data: weeklyResults = [],
    isLoading,
    error,
  } = useWeeklyStandings(week)
  
  // Get week 16 results for finals bracket (always fetch, even if not finals week)
  const { data: week16Results = [] } = useWeeklyStandings("16")
  
  // Get player data for team abbreviations
  const { data: playersData } = useSleeperPlayers()
  
  // Get top 4 teams for playoffs
  const playoffTeams = overallStandings.slice(0, 4).map((team, index) => ({
    ...team,
    seed: index + 1
  }))
  
  // Helper to get team by seed
  const getTeamBySeed = (seed) => playoffTeams.find(t => t.seed === seed)
  
  // Helper to get match result
  const getMatchResult = (team1Name, team2Name) => {
    const team1Result = weeklyResults.find(r => r.teamName === team1Name)
    const team2Result = weeklyResults.find(r => r.teamName === team2Name)
    
    if (!team1Result || !team2Result) return null
    
    return {
      team1: {
        name: team1Name,
        points: parseFloat(team1Result.points),
        projectedPoints: parseFloat(team1Result.projectedTotal),
        starters: team1Result.starters || []
      },
      team2: {
        name: team2Name,
        points: parseFloat(team2Result.points),
        projectedPoints: parseFloat(team2Result.projectedTotal),
        starters: team2Result.starters || []
      },
      winner: parseFloat(team1Result.points) > parseFloat(team2Result.points) ? team1Name : team2Name
    }
  }
  
  // Get highlight style
  const getHighlightStyle = (teamName) => {
    if (selectedTeam === 'All Teams' || selectedTeam !== teamName) {
      return ""
    }
    return "ring-2 ring-primary bg-accent/50"
  }
  
  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-muted-foreground">Loading playoff bracket...</p>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Failed to load playoff data
      </div>
    )
  }
  
  // Semi-finals bracket (Week 16)
  if (isSemiFinals) {
    const team1 = getTeamBySeed(1)
    const team4 = getTeamBySeed(4)
    const team2 = getTeamBySeed(2)
    const team3 = getTeamBySeed(3)
    
    const match1 = team1 && team4 ? getMatchResult(team1.teamName, team4.teamName) : null
    const match2 = team2 && team3 ? getMatchResult(team2.teamName, team3.teamName) : null
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Playoff Semi-Finals</h3>
          <p className="text-muted-foreground">Week 16</p>
        </div>
        
        <div className="grid gap-8">
          {/* Match 1: 1 vs 4 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm text-center">Match 1</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <TeamCard 
                  team={team1} 
                  seed={1} 
                  score={match1?.team1.points}
                  projectedScore={match1?.team1.projectedPoints}
                  isWinner={match1?.winner === team1?.teamName}
                  highlight={getHighlightStyle(team1?.teamName)}
                />
                <div className="text-xl font-bold text-muted-foreground">VS</div>
                <TeamCard 
                  team={team4} 
                  seed={4} 
                  score={match1?.team2.points}
                  projectedScore={match1?.team2.projectedPoints}
                  isWinner={match1?.winner === team4?.teamName}
                  highlight={getHighlightStyle(team4?.teamName)}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Match 2: 2 vs 3 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm text-center">Match 2</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <TeamCard 
                  team={team2} 
                  seed={2} 
                  score={match2?.team1.points}
                  projectedScore={match2?.team1.projectedPoints}
                  isWinner={match2?.winner === team2?.teamName}
                  highlight={getHighlightStyle(team2?.teamName)}
                />
                <div className="text-xl font-bold text-muted-foreground">VS</div>
                <TeamCard 
                  team={team3} 
                  seed={3} 
                  score={match2?.team2.points}
                  projectedScore={match2?.team2.projectedPoints}
                  isWinner={match2?.winner === team3?.teamName}
                  highlight={getHighlightStyle(team3?.teamName)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  
  // Finals bracket (Week 17)
  if (isFinals) {
    if (week16Results.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Waiting for semi-final results...</p>
        </div>
      )
    }
    
    // Determine semi-final winners by checking week 15 results
    const team1 = getTeamBySeed(1)
    const team4 = getTeamBySeed(4)
    const team2 = getTeamBySeed(2)
    const team3 = getTeamBySeed(3)
    
    // Helper to get match result from week 16
    const getWeek16MatchResult = (team1Name, team2Name) => {
      const team1Result = week16Results.find(r => r.teamName === team1Name)
      const team2Result = week16Results.find(r => r.teamName === team2Name)
      
      if (!team1Result || !team2Result) return null
      
      return {
        team1: {
          name: team1Name,
          points: parseFloat(team1Result.points),
          projectedPoints: parseFloat(team1Result.projectedTotal),
          starters: team1Result.starters || []
        },
        team2: {
          name: team2Name,
          points: parseFloat(team2Result.points),
          projectedPoints: parseFloat(team2Result.projectedTotal),
          starters: team2Result.starters || []
        },
        winner: parseFloat(team1Result.points) > parseFloat(team2Result.points) ? team1Name : team2Name
      }
    }
    
    const match1Result = team1 && team4 ? getWeek16MatchResult(team1.teamName, team4.teamName) : null
    const match2Result = team2 && team3 ? getWeek16MatchResult(team2.teamName, team3.teamName) : null
    
    const finalist1 = match1Result?.winner
    const finalist2 = match2Result?.winner
    
    const loser1 = match1Result ? (match1Result.winner === team1?.teamName ? team4?.teamName : team1?.teamName) : null
    const loser2 = match2Result ? (match2Result.winner === team2?.teamName ? team3?.teamName : team2?.teamName) : null
    
    // Get finals results
    const finalsMatch = finalist1 && finalist2 ? getMatchResult(finalist1, finalist2) : null
    const thirdPlaceMatch = loser1 && loser2 ? getMatchResult(loser1, loser2) : null
    
    return (
      <div className="space-y-6">
        {/* Championship Match */}
        <FinalsMatch
          match={finalsMatch}
          title="Championship Game"
          icon={<Trophy className="h-5 w-5" />}
          highlight1={getHighlightStyle(finalist1)}
          highlight2={getHighlightStyle(finalist2)}
          week17Complete={week17Complete}
          playersData={playersData}
        />
        
        <div className="border-t"></div>
        
        {/* 3rd Place Match */}
        <FinalsMatch
          match={thirdPlaceMatch}
          title="3rd Place Game"
          icon={<Medal className="h-4 w-4 text-orange-600 dark:text-orange-500" />}
          highlight1={getHighlightStyle(loser1)}
          highlight2={getHighlightStyle(loser2)}
          week17Complete={week17Complete}
          playersData={playersData}
        />
      </div>
    )
  }
  
  return null
}

// Helper function to shorten player names
function shortenPlayerName(fullName) {
  if (!fullName) return 'Unknown'
  const parts = fullName.trim().split(' ')
  if (parts.length < 2) return fullName
  const firstName = parts[0]
  const lastName = parts[parts.length - 1]
  return `${firstName.charAt(0)}. ${lastName}`
}

// Finals match component with rosters
function FinalsMatch({ match, title, icon, highlight1, highlight2, week17Complete, playersData }) {
  if (!match || !match.team1 || !match.team2) return null
  
  const isChampionshipMatch = title.includes("Championship")
  const showChampion = isChampionshipMatch && week17Complete
  
  return (
    <div>
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          {icon && <span className={isChampionshipMatch ? "text-yellow-600 dark:text-yellow-500" : ""}>{icon}</span>}
          {title}
          {icon && <span className={isChampionshipMatch ? "text-yellow-600 dark:text-yellow-500" : ""}>{icon}</span>}
        </div>
        {isChampionshipMatch && !week17Complete && (
          <p className="text-xs text-muted-foreground mt-1">Champion will be crowned after Monday Night Football</p>
        )}
      </div>
      
      {/* Team Headers */}
      <div className="grid grid-cols-12 gap-2 mb-4 p-3 border rounded-lg bg-muted/10">
        <div className={`col-span-5 text-center p-2 rounded-lg ${highlight1} ${week17Complete && match.winner === match.team1.name ? 'border border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}>
          <div className={`font-semibold text-sm ${showChampion && match.winner === match.team1.name ? 'text-yellow-600 dark:text-yellow-500' : ''}`}>
            {match.team1.name}
          </div>
          <PlayoffTeamScore
            points={match.team1.points}
          />
          <div className="text-xs text-gray-400">
            {match.team1.projectedPoints.toFixed(1)}
          </div>
          {showChampion && match.winner === match.team1.name && (
            <div className="flex items-center justify-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 font-semibold mt-1">
              <Trophy className="h-3 w-3" />
              CHAMPION
            </div>
          )}
        </div>
        
        <div className="col-span-2 text-center text-xs text-muted-foreground self-center">
          VS
        </div>
        
        <div className={`col-span-5 text-center p-2 rounded-lg ${highlight2} ${week17Complete && match.winner === match.team2.name ? 'border border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}>
          <div className={`font-semibold text-sm ${showChampion && match.winner === match.team2.name ? 'text-yellow-600 dark:text-yellow-500' : ''}`}>
            {match.team2.name}
          </div>
          <PlayoffTeamScore
            points={match.team2.points}
          />
          <div className="text-xs text-gray-400">
            {match.team2.projectedPoints.toFixed(1)}
          </div>
          {showChampion && match.winner === match.team2.name && (
            <div className="flex items-center justify-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 font-semibold mt-1">
              <Trophy className="h-3 w-3" />
              CHAMPION
            </div>
          )}
        </div>
      </div>
      
      {/* Player Matchups */}
      <div className="space-y-2 text-xs sm:text-sm">
        {match.team1.starters.map((player1, idx) => {
          const player2 = match.team2.starters[idx]
          if (!player2) return null
          
          // Get team abbreviations from player data
          const getPlayerTeam = (playerId) => {
            const playerInfo = playersData?.players?.[playerId]
            return playerInfo?.team || ''
          }
          
          const player1Team = getPlayerTeam(player1.player_id)
          const player2Team = getPlayerTeam(player2.player_id)
          
          return (
            <div key={idx} className="grid grid-cols-12 gap-1 py-2">
              {/* Team 1 Player */}
              <div className="col-span-5 px-2">
                <div className="flex justify-between items-center">
                  <div className="text-left">{shortenPlayerName(player1.player)}</div>
                  <div className="font-medium text-right">
                    {parseFloat(player1.points || 0).toFixed(1)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex justify-between items-center">
                  <span>{player1Team}</span>
                  <span>{parseFloat(player1.projected_points || 0).toFixed(1)}</span>
                </div>
              </div>
              
              {/* Position */}
              <div className="col-span-2 text-center font-medium text-muted-foreground self-start">
                {player1.lineup_position}
              </div>
              
              {/* Team 2 Player */}
              <div className="col-span-5 px-2">
                <div className="flex justify-between items-center">
                  <div className="font-medium text-left">
                    {parseFloat(player2.points || 0).toFixed(1)}
                  </div>
                  <div className="text-right">{shortenPlayerName(player2.player)}</div>
                </div>
                <div className="text-xs text-muted-foreground flex justify-between items-center">
                  <span>{parseFloat(player2.projected_points || 0).toFixed(1)}</span>
                  <span>{player2Team}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Team card component for bracket display
function TeamCard({ team, seed, score, projectedScore, isWinner, highlight, isChampion }) {
  if (!team) return <div className="flex-1" />
  
  return (
    <div className={`flex-1 p-1.5 sm:p-4 rounded-lg ${highlight} ${isWinner ? 'border border-green-500 bg-green-50 dark:bg-green-900/20' : ''} ${isChampion ? 'ring-2 ring-yellow-500' : ''}`}>
      <div className="text-center space-y-1">
        {seed && (
          <div className="text-xs text-muted-foreground">Seed #{seed}</div>
        )}
        <div className={`font-semibold ${isChampion ? 'text-yellow-600 dark:text-yellow-500' : ''}`}>
          {team.teamName}
        </div>
        {score !== undefined && (
          <div className="text-2xl font-bold">
            {score.toFixed(2)}
            {projectedScore && (
              <span className="text-sm text-muted-foreground ml-1">/{projectedScore.toFixed(1)}</span>
            )}
          </div>
        )}
        {isChampion && (
          <div className="flex items-center justify-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 font-semibold">
            <Trophy className="h-3 w-3" />
            CHAMPION
          </div>
        )}
      </div>
    </div>
  )
}

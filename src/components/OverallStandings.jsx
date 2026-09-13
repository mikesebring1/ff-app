import { Card, CardContent } from "@/components/ui/card"
import OverallStandingsChart from './OverallStandingsChart'
import { useOverallStandings } from '../hooks/useOverallStandings'

export default function OverallStandings({ selectedRosterId, onRosterSelect }) {
  const { data: overallStandings = [], isLoading: loading, error } = useOverallStandings()

  // Highlight selected team with background
  const getHighlightStyle = (rosterId) => {
    if (selectedRosterId == null || selectedRosterId !== String(rosterId)) {
      return "hover:bg-accent/50"
    }
    
    return "bg-accent/100"
  }

  return (
    <div>
      <Card>
        <CardContent className="pt-6">
          {/* Column Headers */}
          <div className="flex justify-between items-center py-2 border-b font-medium text-sm text-muted-foreground">
            <div className="flex items-center gap-2 pl-4">
              <span>Team</span>
            </div>
            <div className="flex gap-8 pr-4">
              <span>Points</span>
              <span>Playoff %</span>
            </div>
          </div>

          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span>Loading overall standings...</span>
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
          
          {!loading && !error && (
            <div className="space-y-0">
              {overallStandings.map((team) => (
                <div 
                  key={team.id}
                  className={`flex items-center justify-between py-4 px-4 border-b last:border-b-0 ${getHighlightStyle(team.id)}`}
                >
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm font-medium">
                        {team.rank} - {team.teamName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {team.overallRecord}, {team.earnings}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-8 text-sm font-medium">
                    <span className="text-primary">{team.totalPoints}</span>
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

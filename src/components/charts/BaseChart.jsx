import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import { Button } from "@/components/ui/button"

const buildChartConfig = (teams) => {
  const config = {}
  teams.forEach((team) => {
    config[team.dataKey] = {
      label: team.label,
    }
  })
  return config
}


export default function BaseChart({ 
  title, 
  fetchDataFn, 
  selectedRosterId,
  onRosterSelect,
  maxTeams = 11 
}) {
  const [chartData, setChartData] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadChartData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const { chartData: data, teams: loadedTeams } = await fetchDataFn()
        
        setChartData(data)
        setTeams(loadedTeams)
      } catch (err) {
        console.error('Error fetching chart data:', err)
        setError('Failed to load chart data')
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
  }, [fetchDataFn])

  const getStrokeColor = (rosterId) => {
    if (selectedRosterId == null) {
      const teamIndex = teams.findIndex((team) => team.rosterId === rosterId)
      return `var(--chart-${(Math.max(teamIndex, 0) % 5) + 1})`
    }
    if (selectedRosterId === rosterId) {
      return "var(--chart-1)"
    }
    return "var(--muted)"
  }
  const selectedSeries = teams.find(
    (team) => team.rosterId === selectedRosterId,
  )

  const statusMessage = loading
    ? 'Loading chart data...'
    : error || (!chartData.length ? 'No chart data available yet' : null)

  if (statusMessage) {
    return (
      <Card className="mt-6">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className={`text-center py-8 ${error ? 'text-red-500' : 'text-muted-foreground'}`}>
            {statusMessage}
          </div>
        </CardContent>
      </Card>
    )
  }


  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={buildChartConfig(teams)}>
          <LineChart
            data={chartData}
            margin={{
              left: 0,
              right: 0,
              top: 12,
              bottom: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis 
              dataKey="week" 
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis 
              domain={[1, Math.max(teams.length, maxTeams - 1)]}
              reversed={true}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              ticks={Array.from({length: Math.max(teams.length, maxTeams - 1)}, (_, i) => i + 1)}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              domain={[1, Math.max(teams.length, maxTeams - 1)]}
              reversed={true}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              ticks={Array.from({length: Math.max(teams.length, maxTeams - 1)}, (_, i) => i + 1)}
            />
            <ChartTooltip 
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            {/* Render non-selected teams first */}
            {teams
              .filter((team) => team.rosterId !== selectedRosterId)
              .map((team) => (
                <Line
                  key={team.rosterId}
                  type="monotone"
                  dataKey={team.dataKey}
                  stroke={getStrokeColor(team.rosterId)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            {/* Render selected team last so it appears on top */}
            {selectedSeries && (
              <Line
                key={selectedSeries.rosterId}
                type="monotone"
                dataKey={selectedSeries.dataKey}
                stroke={getStrokeColor(selectedSeries.rosterId)}
                strokeWidth={3}
                dot={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ChartContainer>
        
        {/* Team Legend */}
        <div className="mt-4 pb-2">
          <div className="flex flex-wrap justify-center gap-2">
            {teams.map((team) => {
              const isSelected = selectedRosterId === team.rosterId
              const isAllTeams = selectedRosterId == null
              
              return (
                <Button
                  key={team.rosterId}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => onRosterSelect(isSelected ? null : team.rosterId)}
                  className={`min-h-10 px-3 text-sm ${
                    isSelected
                      ? ''
                      : isAllTeams
                        ? 'hover:bg-primary/10'
                        : 'opacity-50 hover:opacity-100'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/10"
                    style={{ backgroundColor: getStrokeColor(team.rosterId) }}
                    aria-hidden="true"
                  />
                  {team.label}
                </Button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import { Button } from "@/components/ui/button"

const buildChartConfig = (teamNames) => {
  const config = {}
  teamNames.forEach((teamName) => {
    config[teamName] = {
      label: teamName,
    }
  })
  return config
}


export default function BaseChart({ 
  title, 
  fetchDataFn, 
  selectedTeam, 
  onTeamSelect,
  maxTeams = 11 
}) {
  const [chartData, setChartData] = useState([])
  const [teamNames, setTeamNames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadChartData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const { chartData: data, teamNames: names } = await fetchDataFn()
        
        setChartData(data)
        setTeamNames(names)
      } catch (err) {
        console.error('Error fetching chart data:', err)
        setError('Failed to load chart data')
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
  }, [fetchDataFn])

  const getStrokeColor = (teamName) => {
    if (selectedTeam === 'All Teams') {
      return "var(--muted-foreground)"
    }
    if (selectedTeam === teamName) {
      return "var(--primary)"
    }
    return "var(--muted)"
  }

  const statusMessage = loading
    ? 'Loading chart data...'
    : error || (!chartData.length ? 'No chart data available yet' : null)

  if (statusMessage) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-center py-8 ${error ? 'text-red-500' : 'text-muted-foreground'}`}>
            {statusMessage}
          </div>
        </CardContent>
      </Card>
    )
  }


  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={buildChartConfig(teamNames)}>
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
              domain={[1, Math.max(teamNames.length, maxTeams - 1)]}
              reversed={true}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              ticks={Array.from({length: Math.max(teamNames.length, maxTeams - 1)}, (_, i) => i + 1)}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              domain={[1, Math.max(teamNames.length, maxTeams - 1)]}
              reversed={true}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              ticks={Array.from({length: Math.max(teamNames.length, maxTeams - 1)}, (_, i) => i + 1)}
            />
            <ChartTooltip 
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            {/* Render non-selected teams first */}
            {teamNames
              .filter(teamName => teamName !== selectedTeam)
              .map((teamName) => (
                <Line
                  key={teamName}
                  type="monotone"
                  dataKey={teamName}
                  stroke={getStrokeColor(teamName)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            {/* Render selected team last so it appears on top */}
            {selectedTeam && selectedTeam !== 'All Teams' && teamNames.includes(selectedTeam) && (
              <Line
                key={selectedTeam}
                type="monotone"
                dataKey={selectedTeam}
                stroke={getStrokeColor(selectedTeam)}
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
            {teamNames.map((teamName) => {
              const isSelected = selectedTeam === teamName
              const isAllTeams = selectedTeam === 'All Teams'
              
              return (
                <Button
                  key={teamName}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => onTeamSelect(isSelected ? 'All Teams' : teamName)}
                  className={`text-xs h-7 px-2 ${
                    isSelected
                      ? ''
                      : isAllTeams
                        ? 'hover:bg-primary/10'
                        : 'opacity-50 hover:opacity-100'
                  }`}
                >
                  {teamName}
                </Button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

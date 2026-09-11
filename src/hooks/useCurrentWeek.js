import { useMemo } from 'react'
import { useSleeperNFLState } from './useSleeper'

export function useCurrentWeek() {
  const { data: nflState } = useSleeperNFLState()
  
  const calculatedWeek = useMemo(() => {
    // Get current date
    const now = new Date()
    const currentYear = now.getFullYear()
    
    // Find Labor Day (first Monday of September)
    const september = new Date(currentYear, 8, 1) // Month is 0-indexed
    const dayOfWeek = september.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7
    const laborDay = new Date(currentYear, 8, 1 + daysUntilMonday)
    
    // Season starts the Thursday after Labor Day
    const seasonStart = new Date(laborDay)
    seasonStart.setDate(laborDay.getDate() + 3) // Thursday after Monday
    
    // If we're before the season start, return week 1
    if (now < seasonStart) {
      return 1
    }
    
    // Calculate weeks elapsed since season start
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const weeksElapsed = Math.floor((now - seasonStart) / msPerWeek)
    
    // NFL regular season is 18 weeks, playoffs are weeks 16-17
    const calculatedWeek = Math.min(weeksElapsed + 1, 18)
    
    return calculatedWeek
  }, [])
  
  // Use Sleeper API value if available and seems reasonable, otherwise use calculated
  const currentWeek = (nflState?.week && nflState.week >= 1 && nflState.week <= 18) 
    ? nflState.week 
    : calculatedWeek
    
  return { currentWeek }
}

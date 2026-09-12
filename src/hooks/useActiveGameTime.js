import { useLeagueContext } from './useLeagueContext'

/**
 * Hook to determine if it's currently an active NFL game time
 * Active times: Thursday evenings, Sundays, and Monday evenings during game times
 */
export function useActiveGameTime(selectedWeek = null) {
  const { data: nflState } = useLeagueContext()
  
  // Check if it's an active NFL day and time
  const isActiveGameDay = () => {
    const now = new Date()
    const day = now.getDay() // 0 = Sunday, 1 = Monday, 4 = Thursday
    const hour = now.getHours() // 0-23
    
    // Thursday: Only during evening games (5 PM - 11:59 PM)
    if (day === 4) {
      return hour >= 17
    }
    
    // Sunday: All day during football season (6 AM - 11:59 PM)
    if (day === 0) {
      return hour >= 6 && hour <= 23
    }
    
    // Monday: Only during evening games (5 PM - 11:59 PM)
    if (day === 1) {
      return hour >= 17 && hour <= 23
    }
    
    return false
  }
  
  // Return true if there are active games (NFL state + correct day/time + matching week)
  return nflState?.season_type === 'regular' && 
         (!selectedWeek || nflState?.week === parseInt(selectedWeek)) && // current week matches selected week (if provided)
         isActiveGameDay() // and it's during active game times
}

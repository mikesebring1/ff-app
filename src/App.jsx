import { useState, useEffect } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Moon, Sun, Menu } from "lucide-react"
import WeeklyStandings from './components/WeeklyStandings'
import OverallStandings from './components/OverallStandings'
import PlayoffBracket from './components/PlayoffBracket'
import { useTeams } from './hooks/useTeams'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { useCurrentWeek } from './hooks/useCurrentWeek'

function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })

  const [selectedTeam, setSelectedTeam] = useState('All Teams')

  // Fetch team names dynamically from API
  const { teams, loading: teamsLoading, error: teamsError } = useTeams()
  
  // Network status for mobile connectivity awareness
  const { isOnline, isSlowConnection } = useNetworkStatus()
  
  // Get current week info for playoff tab visibility
  const {
    currentWeek,
    isLoading: leagueContextLoading,
    error: leagueContextError
  } = useCurrentWeek()
  
  // PWA update handling
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [swRegistration, setSwRegistration] = useState(null)

  // Ensure selectedTeam is valid when teams are loaded
  useEffect(() => {
    if (!teamsLoading && !teamsError && teams.length > 0) {
      // If current selectedTeam is not in the loaded teams, reset to 'All Teams'
      if (!teams.includes(selectedTeam.trim())) {
        setSelectedTeam('All Teams')
      }
    }
  }, [teams, teamsLoading, teamsError, selectedTeam])

  // Handle dark mode
  useEffect(() => {
    const root = window.document.documentElement
    if (isDarkMode) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDarkMode])

  // PWA update handling
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        setSwRegistration(registration)
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true)
              }
            })
          }
        })
      })
    }
  }, [])

  const handleUpdate = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    }
  }

  return (
    <>
      <div className="min-h-screen bg-background">
      {/* Menu button in absolute top-right corner */}
      <div className="absolute top-8 right-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5 text-sm cursor-default">
              <div className="flex items-center">
                {isDarkMode ? (
                  <>
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Dark mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="mr-2 h-4 w-4" />
                    <span>Light mode</span>
                  </>
                )}
              </div>
              <Switch
                checked={isDarkMode}
                onCheckedChange={setIsDarkMode}
                className="ml-2"
              />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>View as</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {teamsLoading ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    Loading teams...
                  </DropdownMenuItem>
                ) : teamsError ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    Error loading teams
                  </DropdownMenuItem>
                ) : (
                  teams.map((team) => (
                    <DropdownMenuItem
                      key={team}
                      onClick={() => setSelectedTeam(team)}
                      className={selectedTeam === team ? "bg-accent" : ""}
                    >
                      {team}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="max-w-4xl mx-auto pt-16 pb-8 px-4 sm:pt-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Madtown's Finest Standings</h1>
          {leagueContextLoading && (
            <div className="mt-2 text-sm text-muted-foreground">
              Resolving the active league...
            </div>
          )}
          {leagueContextError && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
              Unable to resolve the active league: {leagueContextError.message}
            </div>
          )}
          {!isOnline && (
            <div className="mt-2 text-sm text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 px-3 py-1 rounded-full inline-block">
              ⚠️ Offline - Some features may be limited
            </div>
          )}
          {isOnline && isSlowConnection && (
            <div className="mt-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 px-3 py-1 rounded-full inline-block">
              🐌 Slow connection detected - Using cached data when possible
            </div>
          )}
          {updateAvailable && (
            <div className="mt-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 px-3 py-1 rounded-full inline-block">
              <button 
                onClick={handleUpdate}
                className="underline hover:no-underline"
              >
                🔄 Update Available - Tap to refresh
              </button>
            </div>
          )}
        </div>
        
        {!leagueContextLoading && !leagueContextError && currentWeek && (
          <Tabs defaultValue={currentWeek >= 16 ? "playoffs" : "weekly"} className="w-full">
            <TabsList className={`grid w-full ${currentWeek >= 16 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {currentWeek >= 16 && (
                <TabsTrigger value="playoffs">Playoffs</TabsTrigger>
              )}
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="overall">Overall</TabsTrigger>
            </TabsList>

            <TabsContent value="weekly" className="mt-6">
              <WeeklyStandings selectedTeam={selectedTeam} onTeamSelect={setSelectedTeam} />
            </TabsContent>

            {currentWeek >= 16 && (
              <TabsContent value="playoffs" className="mt-6">
                <PlayoffBracket week={currentWeek.toString()} selectedTeam={selectedTeam} />
              </TabsContent>
            )}

            <TabsContent value="overall" className="mt-6">
              <OverallStandings selectedTeam={selectedTeam} onTeamSelect={setSelectedTeam} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
    <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}

export default App

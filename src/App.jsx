import { useState, useEffect, useSyncExternalStore } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Monitor, Moon, Sun, Menu } from "lucide-react"
import WeeklyStandings from './components/WeeklyStandings'
import OverallStandings from './components/OverallStandings'
import PlayoffBracket from './components/PlayoffBracket'
import { useTeams } from './hooks/useTeams'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { useCurrentWeek } from './hooks/useCurrentWeek'
import {
  getThemeStorage,
  normalizeThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveDarkMode,
} from './lib/theme-preference'
import {
  rosterIdFromTeamSelection,
  teamSelectionValue,
} from './lib/team-names'

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

function getSystemDarkMode() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(SYSTEM_THEME_QUERY).matches
}

function subscribeToSystemDarkMode(onChange) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }

  const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY)
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }

  if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(onChange)
    return () => mediaQuery.removeListener(onChange)
  }

  return () => {}
}

function App() {
  const [themePreference, setThemePreference] = useState(() => {
    if (typeof window === 'undefined') return 'system'
    return readThemePreference(getThemeStorage(window))
  })
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemDarkMode,
    getSystemDarkMode,
    () => false,
  )
  const isDarkMode = resolveDarkMode(themePreference, systemPrefersDark)

  const [selectedRosterId, setSelectedRosterId] = useState(null)

  const { teams, loading: teamsLoading, error: teamsError } = useTeams()

  const { isOnline, isSlowConnection } = useNetworkStatus()

  const {
    currentWeek,
    isLoading: leagueContextLoading,
    error: leagueContextError
  } = useCurrentWeek()
  
  const [updateInProgress, setUpdateInProgress] = useState(false)
  const {
    needRefresh: [updateAvailable],
    updateServiceWorker,
  } = useRegisterSW()

  // Reset a selection that no longer belongs to the active league.
  useEffect(() => {
    if (!teamsLoading && !teamsError && selectedRosterId != null) {
      if (!teams.some((team) => team.rosterId === selectedRosterId)) {
        setSelectedRosterId(null)
      }
    }
  }, [selectedRosterId, teams, teamsLoading, teamsError])

  // Apply the resolved theme while retaining the user's three-state preference.
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.toggle('dark', isDarkMode)
    persistThemePreference(getThemeStorage(window), themePreference)
  }, [isDarkMode, themePreference])

  const handleUpdate = async () => {
    if (updateInProgress) return

    setUpdateInProgress(true)
    try {
      await updateServiceWorker(true)
    } catch (error) {
      console.error('Failed to activate the app update', error)
      setUpdateInProgress(false)
    }
  }

  return (
    <>
      <div className="min-h-screen bg-background">
      <div className="absolute top-8 right-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open settings">
              <Menu className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {themePreference === 'system' ? (
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                ) : isDarkMode ? (
                  <Moon className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Sun className="h-4 w-4" aria-hidden="true" />
                )}
                <span>Theme</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={themePreference}
                  onValueChange={(value) => setThemePreference(normalizeThemePreference(value))}
                >
                  <DropdownMenuRadioItem value="system" className="gap-2">
                    <Monitor className="h-4 w-4" aria-hidden="true" />
                    System
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="light" className="gap-2">
                    <Sun className="h-4 w-4" aria-hidden="true" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" className="gap-2">
                    <Moon className="h-4 w-4" aria-hidden="true" />
                    Dark
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
                  <DropdownMenuRadioGroup
                    value={teamSelectionValue(selectedRosterId)}
                    onValueChange={(value) => {
                      setSelectedRosterId(rosterIdFromTeamSelection(value))
                    }}
                  >
                    {teams.map((team) => (
                      <DropdownMenuRadioItem key={team.value} value={team.value}>
                        {team.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
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
                disabled={updateInProgress}
                className="underline hover:no-underline disabled:cursor-wait disabled:no-underline"
              >
                {updateInProgress
                  ? '🔄 Updating...'
                  : '🔄 Update Available - Tap to refresh'}
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
              <WeeklyStandings
                selectedRosterId={selectedRosterId}
                onRosterSelect={setSelectedRosterId}
              />
            </TabsContent>

            {currentWeek >= 16 && (
              <TabsContent value="playoffs" className="mt-6">
                <PlayoffBracket
                  week={currentWeek.toString()}
                  selectedRosterId={selectedRosterId}
                />
              </TabsContent>
            )}

            <TabsContent value="overall" className="mt-6">
              <OverallStandings
                selectedRosterId={selectedRosterId}
                onRosterSelect={setSelectedRosterId}
              />
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

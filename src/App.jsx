import { useState, useEffect, useSyncExternalStore } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  Medal,
  Monitor,
  Moon,
  Settings,
  Sun,
  TrendingUpDown,
  Trophy,
} from "lucide-react"
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
  const [activeView, setActiveView] = useState(null)

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

  const showPlayoffs = currentWeek >= 16
  const resolvedActiveView = activeView === 'playoffs' && !showPlayoffs
    ? 'weekly'
    : activeView ?? (showPlayoffs ? 'playoffs' : 'weekly')
  const leagueReady = !leagueContextLoading && !leagueContextError && Boolean(currentWeek)

  return (
    <>
      <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-[calc(7rem+env(safe-area-inset-bottom))]">
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
        
        <Tabs value={resolvedActiveView} onValueChange={setActiveView} className="w-full">
            <TabsContent value="weekly" className="mt-0">
              {leagueReady && (
              <WeeklyStandings
                selectedRosterId={selectedRosterId}
                onRosterSelect={setSelectedRosterId}
              />
              )}
            </TabsContent>

            {showPlayoffs && (
              <TabsContent value="playoffs" className="mt-0">
                <PlayoffBracket
                  week={currentWeek.toString()}
                  selectedRosterId={selectedRosterId}
                />
              </TabsContent>
            )}

            <TabsContent value="overall" className="mt-0">
              {leagueReady && (
              <OverallStandings
                selectedRosterId={selectedRosterId}
                onRosterSelect={setSelectedRosterId}
              />
              )}
            </TabsContent>

            <nav
              aria-label="Primary navigation"
              className={`fixed left-1/2 z-40 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 gap-1 overflow-hidden rounded-full border bg-card/90 p-1.5 shadow-lg backdrop-blur-xl ${showPlayoffs ? 'grid-cols-4' : 'grid-cols-3'}`}
              style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <TabsList
                aria-label="Standings views"
                className={`grid h-auto w-full gap-1 bg-transparent p-0 ${showPlayoffs ? 'col-span-3 grid-cols-3' : 'col-span-2 grid-cols-2'}`}
              >
                <TabsTrigger
                  value="weekly"
                  className="min-h-14 flex-col gap-1 rounded-full px-2 py-1.5 text-[0.6875rem] leading-none hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  <TrendingUpDown className="h-5 w-5" aria-hidden="true" />
                  <span>Weekly</span>
                </TabsTrigger>
                <TabsTrigger
                  value="overall"
                  className="min-h-14 flex-col gap-1 rounded-full px-2 py-1.5 text-[0.6875rem] leading-none hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  <Medal className="h-5 w-5" aria-hidden="true" />
                  <span>Overall</span>
                </TabsTrigger>
                {showPlayoffs && (
                  <TabsTrigger
                    value="playoffs"
                    className="min-h-14 flex-col gap-1 rounded-full px-2 py-1.5 text-[0.6875rem] leading-none hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                  >
                    <Trophy className="h-5 w-5" aria-hidden="true" />
                    <span>Playoffs</span>
                  </TabsTrigger>
                )}
              </TabsList>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="min-h-14 h-auto flex-col gap-1 rounded-full border-0 bg-transparent px-2 py-1.5 text-[0.6875rem] leading-none text-muted-foreground shadow-none data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:shadow [&_svg]:size-5"
                  >
                    <Settings className="h-5 w-5" aria-hidden="true" />
                    <span>Settings</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" sideOffset={12}>
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
            </nav>
          </Tabs>
      </div>
    </div>
    <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}

export default App

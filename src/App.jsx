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
  Activity,
  Medal,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  TrendingUpDown,
  Trophy,
  WifiOff,
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

function SettingsMenu({
  align = 'end',
  isDarkMode,
  selectedRosterId,
  setSelectedRosterId,
  setThemePreference,
  side = 'top',
  teams,
  teamsError,
  teamsLoading,
  themePreference,
  triggerClassName = '',
  triggerLabel = 'Settings',
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={triggerLabel}
          className={triggerClassName}
        >
          <Settings aria-hidden="true" />
          <span>{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={12}>
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
  )
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
    displayWeek,
    playoffWeekStart,
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
    root.style.colorScheme = isDarkMode ? 'dark' : 'light'
    window.document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDarkMode ? '#000000' : '#f5f5f7')
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

  const showPlayoffs = displayWeek >= playoffWeekStart
  const resolvedActiveView = activeView === 'playoffs' && !showPlayoffs
    ? 'weekly'
    : activeView ?? (showPlayoffs ? 'playoffs' : 'weekly')
  const leagueReady = !leagueContextLoading && !leagueContextError && Boolean(displayWeek)

  return (
    <>
      <div className="app-shell min-h-screen bg-background">
        <Tabs value={resolvedActiveView} onValueChange={setActiveView} className="relative z-10 w-full">
          <header className="app-header">
            <div className="app-container flex h-14 items-center justify-between gap-6 px-4 sm:px-6">
              <div className="brand-lockup">
                <div className="brand-mark" aria-hidden="true">
                  <span>MF</span>
                </div>
                <div>
                  <div className="brand-name">Madtown's Finest</div>
                  <div className="brand-meta">Fantasy football · Est. 2012</div>
                </div>
              </div>

              <TabsList
                aria-label="Standings views"
                className="desktop-nav hidden h-11 items-center gap-1 bg-white/25 p-1 backdrop-blur-xl md:flex dark:bg-black/15"
              >
                <TabsTrigger value="weekly" className="desktop-nav-item">
                  Weekly
                </TabsTrigger>
                <TabsTrigger value="overall" className="desktop-nav-item">
                  Overall
                </TabsTrigger>
                {showPlayoffs && (
                  <TabsTrigger value="playoffs" className="desktop-nav-item">
                    Playoffs
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="hidden md:block">
                <SettingsMenu
                  isDarkMode={isDarkMode}
                  selectedRosterId={selectedRosterId}
                  setSelectedRosterId={setSelectedRosterId}
                  setThemePreference={setThemePreference}
                  side="bottom"
                  teams={teams}
                  teamsError={teamsError}
                  teamsLoading={teamsLoading}
                  themePreference={themePreference}
                  triggerClassName="header-settings h-10 rounded-full border-transparent bg-transparent px-4 text-sm font-medium shadow-none hover:bg-accent [&_svg]:size-4"
                />
              </div>
            </div>
          </header>

          <main className="app-container px-3 pt-3 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 md:pb-16">
            <div className="status-row app-status-row" aria-live="polite">
              {leagueContextLoading && (
                <div className="status-chip">
                  <Activity className="h-4 w-4 animate-pulse" aria-hidden="true" />
                  Resolving the active league
                </div>
              )}
              {leagueContextError && (
                <div className="status-chip status-chip-error">
                  Unable to resolve the active league: {leagueContextError.message}
                </div>
              )}
              {!isOnline && (
                <div className="status-chip status-chip-warning">
                  <WifiOff className="h-4 w-4" aria-hidden="true" />
                  Offline · cached features remain available
                </div>
              )}
              {isOnline && isSlowConnection && (
                <div className="status-chip status-chip-warning">
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  Slow connection · prioritizing cached data
                </div>
              )}
              {updateAvailable && (
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={updateInProgress}
                  className="status-chip status-chip-action disabled:cursor-wait"
                >
                  <RefreshCw className={`h-4 w-4 ${updateInProgress ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {updateInProgress ? 'Updating the app' : 'Update available · refresh now'}
                </button>
              )}
            </div>

            <div className="content-stage">
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
                    selectedRosterId={selectedRosterId}
                    onRosterSelect={setSelectedRosterId}
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
            </div>

            <nav
              aria-label="Primary navigation"
              className={`mobile-nav fixed left-1/2 z-40 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 gap-1 overflow-hidden rounded-full border bg-card/90 p-1.5 shadow-lg backdrop-blur-xl md:hidden ${showPlayoffs ? 'grid-cols-4' : 'grid-cols-3'}`}
              style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <TabsList
                aria-label="Standings views"
                className={`grid h-auto w-full gap-1 bg-transparent p-0 ${showPlayoffs ? 'col-span-3 grid-cols-3' : 'col-span-2 grid-cols-2'}`}
              >
                <TabsTrigger
                  value="weekly"
                  className="min-h-15 flex-col gap-1 rounded-full px-2 py-1.5 text-sm leading-none hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  <TrendingUpDown className="h-5 w-5" aria-hidden="true" />
                  <span>Weekly</span>
                </TabsTrigger>
                <TabsTrigger
                  value="overall"
                  className="min-h-15 flex-col gap-1 rounded-full px-2 py-1.5 text-sm leading-none hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  <Medal className="h-5 w-5" aria-hidden="true" />
                  <span>Overall</span>
                </TabsTrigger>
                {showPlayoffs && (
                  <TabsTrigger
                    value="playoffs"
                    className="min-h-15 flex-col gap-1 rounded-full px-2 py-1.5 text-sm leading-none hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                  >
                    <Trophy className="h-5 w-5" aria-hidden="true" />
                    <span>Playoffs</span>
                  </TabsTrigger>
                )}
              </TabsList>

              <SettingsMenu
                isDarkMode={isDarkMode}
                selectedRosterId={selectedRosterId}
                setSelectedRosterId={setSelectedRosterId}
                setThemePreference={setThemePreference}
                teams={teams}
                teamsError={teamsError}
                teamsLoading={teamsLoading}
                themePreference={themePreference}
                triggerClassName="min-h-15 h-auto flex-col gap-1 rounded-full border-0 bg-transparent px-2 py-1.5 text-sm leading-none text-muted-foreground shadow-none data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:shadow [&_svg]:size-5"
              />
            </nav>
          </main>
        </Tabs>
      </div>
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}

export default App

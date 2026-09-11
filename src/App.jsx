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
import { apiConfig, adminApiCall, clearPollingStatusCache, isPollingActive } from './config/api'
import { useTeams } from './hooks/useTeams'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { useCurrentWeek } from './hooks/useCurrentWeek'

const ADMIN_ACTIONS = [
  {
    label: 'Sync Historical Data',
    endpoint: apiConfig.endpoints.syncHistorical,
    successLog: 'Historical sync started',
    successAlert: 'Historical data sync started!',
    failureLog: 'Failed to sync historical data',
    failureAlert: 'Failed to start historical sync'
  },
  {
    label: 'Calculate Playoffs',
    endpoint: apiConfig.endpoints.calculatePlayoffs,
    successLog: 'Playoff simulation started',
    successAlert: 'Playoff simulation started!',
    failureLog: 'Failed to calculate playoffs',
    failureAlert: 'Failed to start playoff simulation'
  },
  {
    label: 'Fetch Players Data',
    endpoint: apiConfig.endpoints.fetchPlayers,
    method: 'GET',
    successLog: 'Players data fetched',
    successAlert: 'Players data fetched successfully!',
    failureLog: 'Failed to fetch players',
    failureAlert: 'Failed to fetch players data',
    logFullResponse: true
  }
]

function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })

  const [selectedTeam, setSelectedTeam] = useState('All Teams')
  const [isPolling, setIsPolling] = useState(false)
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('isAdmin') === 'true'
  })

  // Fetch team names dynamically from API
  const { teams, loading: teamsLoading, error: teamsError } = useTeams()
  
  // Network status for mobile connectivity awareness
  const { isOnline, isSlowConnection } = useNetworkStatus()
  
  // Get current week info for playoff tab visibility
  const { currentWeek } = useCurrentWeek()
  
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

  // Check for admin URL parameter on app load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const isAdminRequest = urlParams.get('admin') === 'true'

    if (!isAdminRequest || isAdmin) {
      return
    }

    const authenticateAdmin = async () => {
      const apiKey = prompt('Enter admin API key:')
      if (!apiKey) return

      try {
        console.log('Attempting admin validation with URL:', apiConfig.endpoints.adminValidate)

        const response = await fetch(apiConfig.endpoints.adminValidate, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': apiKey
          },
          body: JSON.stringify({ action: 'validate' })
        })

        console.log('Response status:', response.status)
        console.log('Response headers:', response.headers)

        if (response.status === 200) {
          setIsAdmin(true)
          localStorage.setItem('isAdmin', 'true')
          localStorage.setItem('adminApiKey', apiKey)
          alert('Admin access granted!')
          window.history.replaceState({}, document.title, window.location.pathname)
        } else {
          const errorText = await response.text()
          console.error('API response error:', errorText)
          alert(`Invalid API key (Status: ${response.status})`)
        }
      } catch (error) {
        console.error('Admin validation error:', error)
        alert(`Unable to validate admin access: ${error.message}`)
      }
    }

    authenticateAdmin()
  }, [isAdmin])

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

  // Fetch initial polling status using existing promise-based caching
  useEffect(() => {
    // Clear any stale cache on app load to ensure fresh status
    clearPollingStatusCache()

    isPollingActive()
      .then(pollingActive => {
        console.log('Initial polling status fetched:', pollingActive)
        setIsPolling(pollingActive)
      })
      .catch(error => {
        console.error('Failed to fetch initial polling status:', error)
        // Keep default false value
      })
  }, [])

  const handleUpdate = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    }
  }

  const runAdminAction = async (action) => {
    if (!isAdmin) {
      console.log('Admin access required')
      return
    }

    try {
      const response = await adminApiCall(action.endpoint, {
        method: action.method || 'POST'
      })
      console.log(`${action.successLog}:`, action.logFullResponse ? response : response.message)
      alert(action.successAlert)
    } catch (error) {
      console.error(`${action.failureLog}:`, error)
      alert(action.failureAlert)
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
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Admin</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  className="flex items-center justify-between w-full"
                  onSelect={(e) => e.preventDefault()}
                >
                  <span>Live Updates</span>
                  <Switch
                    checked={isPolling}
                    onCheckedChange={async () => {
                      if (isAdmin) {
                        try {
                          const response = await adminApiCall(apiConfig.endpoints.pollingToggle, {
                            method: 'POST'
                          })
                          setIsPolling(response.enabled)
                          clearPollingStatusCache() // Clear the cache when toggling
                          console.log('Polling toggled:', response.message)
                        } catch (error) {
                          console.error('Failed to toggle polling:', error)
                          alert('Failed to toggle polling')
                        }
                      } else {
                        console.log('Admin access required')
                      }
                    }}
                    disabled={!isAdmin}
                    onClick={(e) => e.stopPropagation()}
                  />
                </DropdownMenuItem>
                {ADMIN_ACTIONS.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    onClick={(event) => {
                      event.preventDefault()
                      runAdminAction(action)
                    }}
                    className={isAdmin ? 'cursor-pointer' : 'text-muted-foreground cursor-default'}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="max-w-4xl mx-auto pt-16 pb-8 px-4 sm:pt-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Madtown's Finest Standings</h1>
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
        
        {/* Tabs same width as accordion */}
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
      </div>
    </div>
    <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}

export default App

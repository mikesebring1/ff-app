import { motion as Motion } from 'motion/react'

const ORBIT_POSITIONS = [
  { left: '30%', top: '18%' },
  { left: '70%', top: '18%' },
  { left: '26%', top: '34%' },
  { left: '74%', top: '34%' },
  { left: '28%', top: '50%' },
  { left: '72%', top: '50%' },
  { left: '26%', top: '66%' },
  { left: '74%', top: '66%' },
  { left: '30%', top: '82%' },
  { left: '70%', top: '82%' },
]

const DRIFT_PATTERNS = [
  { x: [0, 2, -1, 0], y: [0, -2, 1, 0] },
  { x: [0, -2, 1, 0], y: [0, 2, -1, 0] },
  { x: [0, 1, -2, 0], y: [0, 2, -1, 0] },
  { x: [0, -1, 2, 0], y: [0, -2, 1, 0] },
]

export default function PregameCrystalBall({
  onRosterSelect,
  reducedMotion,
  selectedRosterId,
  teams,
  week,
}) {
  return (
    <section className="pb-2 pt-1 text-center" aria-labelledby="pregame-heading">
      <h2 id="pregame-heading" className="text-lg font-semibold">
        Week {week} is still unwritten
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Standings and records will appear as soon as scoring begins.
      </p>

      <div
        className="relative left-1/2 mt-5 aspect-square w-[calc(100%+2rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-full border border-primary/15 bg-[radial-gradient(circle_at_48%_42%,color-mix(in_oklab,var(--color-primary)_13%,transparent),transparent_43%),radial-gradient(circle_at_50%_55%,var(--color-muted),var(--color-card)_70%)] shadow-[inset_0_0_3rem_color-mix(in_oklab,var(--color-primary)_10%,transparent),0_1.25rem_3rem_-2rem_color-mix(in_oklab,var(--color-primary)_35%,transparent)]"
        aria-label={`Week ${week} pregame projections`}
      >
        <div className="pointer-events-none absolute inset-[12%] rounded-full border border-primary/10" />
        <div className="pointer-events-none absolute inset-[30%] rounded-full bg-primary/5 blur-xl" />

        {teams.map((team, index) => {
          const position = ORBIT_POSITIONS[index % ORBIT_POSITIONS.length]
          const drift = DRIFT_PATTERNS[index % DRIFT_PATTERNS.length]
          const isSelected = selectedRosterId === team.rosterId

          return (
            <div
              key={team.rosterId}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={position}
            >
              <Motion.button
                type="button"
                aria-pressed={isSelected}
                className={`w-[clamp(5.75rem,31vw,8.5rem)] rounded-2xl border px-2 py-1 text-center shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/80 bg-card/85 hover:bg-accent'
                }`}
                animate={reducedMotion ? undefined : drift}
                transition={reducedMotion ? undefined : {
                  duration: 7 + (index % 4),
                  ease: 'easeInOut',
                  repeat: Infinity,
                }}
                onClick={() => onRosterSelect?.(isSelected ? null : team.rosterId)}
              >
                <span className="line-clamp-2 block text-[0.6875rem] font-semibold leading-tight sm:text-xs">
                  {team.teamName}
                </span>
                <span className={`mt-0.5 block text-[0.625rem] sm:text-[0.6875rem] ${
                  isSelected ? 'text-primary-foreground/75' : 'text-muted-foreground'
                }`}>
                  Projected {team.projectedTotal ?? '--'}
                </span>
              </Motion.button>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Projections are a preview, not a ranking.
      </p>
    </section>
  )
}

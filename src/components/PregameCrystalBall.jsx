import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion as Motion } from 'motion/react'

const REVEAL_THRESHOLD = 0.24
const RECOVER_DELAY_MS = 5000
const FIZZLE_DURATION_MS = 700
const MAX_PARTICLES = 2600
const FLOAT_POSITIONS = [
  { left: '28%', top: '11%' },
  { left: '72%', top: '16%' },
  { left: '19%', top: '31%' },
  { left: '63%', top: '34%' },
  { left: '37%', top: '50%' },
  { left: '79%', top: '54%' },
  { left: '21%', top: '68%' },
  { left: '61%', top: '72%' },
  { left: '35%', top: '88%' },
  { left: '78%', top: '88%' },
]

const DRIFT_PATTERNS = [
  { x: [0, 2, -1, 0], y: [0, -2, 1, 0] },
  { x: [0, -2, 1, 0], y: [0, 2, -1, 0] },
  { x: [0, 1, -2, 0], y: [0, 2, -1, 0] },
  { x: [0, -1, 2, 0], y: [0, -2, 1, 0] },
]

function createRandom(seed) {
  let value = seed >>> 0

  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(value) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function getEffectiveBackgroundColor(element) {
  let current = element

  while (current) {
    const color = window.getComputedStyle(current).backgroundColor
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color
    current = current.parentElement
  }

  return window.getComputedStyle(document.body).backgroundColor
}

export default function PregameCrystalBall({
  onRosterSelect,
  reducedMotion,
  selectedRosterId,
  teams,
  week,
}) {
  const canvasRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const maskStrengthRef = useRef(1)
  const metricsRef = useRef(null)
  const particlesRef = useRef([])
  const stageRef = useRef(null)
  const pointerRef = useRef(null)
  const progressRef = useRef(0)
  const fizzleDirectionRef = useRef(null)
  const fizzleProgressRef = useRef(0)
  const fizzleStartRef = useRef(null)
  const recoverTimerRef = useRef(null)
  const [fizzling, setFizzling] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const maskKey = useMemo(
    () => `${week}:${teams.map((team) => `${team.rosterId}:${team.projectedTotal}`).join('|')}`,
    [teams, week],
  )

  const paintVeil = useCallback((time = 0) => {
    const canvas = canvasRef.current
    const maskCanvas = maskCanvasRef.current
    const metrics = metricsRef.current

    if (!canvas || !metrics) return

    const { backgroundColor, height, pixelRatio, width } = metrics
    const context = canvas.getContext('2d')
    if (!context) return

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 1
    const fizzleDirection = fizzleDirectionRef.current
    const fizzleProgress = fizzleProgressRef.current
    const easedFizzle = fizzleProgress * fizzleProgress * (3 - 2 * fizzleProgress)
    const surfaceVisibility = fizzleDirection === 'out'
      ? 1 - easedFizzle
      : fizzleDirection === 'in'
        ? easedFizzle
        : 1

    context.globalAlpha = surfaceVisibility
    context.fillStyle = backgroundColor
    context.fillRect(0, 0, width, height)

    particlesRef.current.forEach((particle) => {
      const cycle = (particle.fadePhase + time * 0.00024 * particle.fadeSpeed) % 1
      const visibility = Math.sin(Math.PI * cycle) ** 1.35
      const motion = time * 0.00105 * particle.moveSpeed + particle.motionPhase
      const x = particle.x
        + Math.sin(motion) * particle.driftX
        + Math.sin(motion * 2.37 + particle.fadePhase * 5) * particle.driftX * 0.28
      const y = particle.y
        + Math.cos(motion * 0.83) * particle.driftY
        + Math.cos(motion * 1.91 + particle.fadePhase * 7) * particle.driftY * 0.24
      const twinkle = 0.78 + Math.sin(motion * 1.6) * 0.22
      const localFizzle = Math.max(
        0,
        Math.min(1, (fizzleProgress - particle.fizzleAt) / 0.24),
      )
      const fizzleVisibility = fizzleDirection === 'out'
        ? 1 - localFizzle
        : fizzleDirection === 'in'
          ? localFizzle
          : 1

      if (visibility < 0.025 || fizzleVisibility < 0.025) return

      context.globalAlpha = particle.alpha * visibility * twinkle * fizzleVisibility
      context.fillStyle = particle.color
      context.beginPath()
      context.arc(x, y, particle.radius * (0.45 + visibility * 0.75), 0, Math.PI * 2)
      context.fill()
    })
    if (maskCanvas) {
      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalAlpha = maskStrengthRef.current
      context.globalCompositeOperation = 'destination-out'
      context.drawImage(maskCanvas, 0, 0)
      context.restore()
    }
  }, [])

  const drawVeil = useCallback(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current

    if (!canvas || !stage) return

    const { width, height } = stage.getBoundingClientRect()
    if (!width || !height) return

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)

    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas')
    }
    const maskCanvas = maskCanvasRef.current
    maskCanvas.width = canvas.width
    maskCanvas.height = canvas.height
    maskStrengthRef.current = 1
    fizzleDirectionRef.current = null
    fizzleProgressRef.current = 0
    fizzleStartRef.current = null

    const backgroundColor = getEffectiveBackgroundColor(stage)
    const random = createRandom(hashString(maskKey))
    const rootStyles = window.getComputedStyle(document.documentElement)
    const dotColors = [
      '--team-primary',
      '--team-secondary',
      '--team-tint-foreground',
    ].map((property) => rootStyles.getPropertyValue(property).trim())

    metricsRef.current = {
      backgroundColor,
      height,
      pixelRatio,
      width,
    }

    const particles = []
    for (let index = 0; index < 15000 && particles.length < MAX_PARTICLES; index += 1) {
      const normalizedX = random()
      const normalizedY = random()
      const horizontalEdge = Math.min(normalizedX, 1 - normalizedX) * 2
      const verticalEdge = Math.min(normalizedY, 1 - normalizedY) * 2
      const edgeFade = Math.min(1, Math.min(horizontalEdge, verticalEdge) * 3.4)
      const current = Math.sin(normalizedX * 15 + Math.sin(normalizedY * 8) * 2.1)
        + Math.cos(normalizedY * 17 - normalizedX * 4.5)
      const density = 0.13 + Math.max(0, current) * 0.13 + edgeFade * 0.06

      if (random() > density) continue

      particles.push({
        alpha: (0.28 + random() * 0.68) * (0.18 + edgeFade * 0.82),
        color: dotColors[Math.floor(random() * dotColors.length)],
        driftX: width * (0.004 + random() * 0.012),
        driftY: height * (0.004 + random() * 0.011),
        fadePhase: random(),
        fadeSpeed: 0.8 + random() * 1.7,
        fizzleAt: random() * 0.76,
        motionPhase: random() * Math.PI * 2,
        moveSpeed: 0.6 + random() * 1.4,
        radius: Math.min(width, height) * (0.0018 + random() * 0.0052),
        x: normalizedX * width,
        y: normalizedY * height,
      })
    }
    particlesRef.current = particles
    paintVeil(window.performance.now())
  }, [maskKey, paintVeil])

  useEffect(() => {
    if (recoverTimerRef.current) {
      window.clearTimeout(recoverTimerRef.current)
      recoverTimerRef.current = null
    }
    setFizzling(false)
    setRevealed(false)
    progressRef.current = 0
    pointerRef.current = null
    drawVeil()

    const observer = new ResizeObserver(drawVeil)
    if (stageRef.current) observer.observe(stageRef.current)

    const themeObserver = new MutationObserver(drawVeil)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-favorite-nfl-team'],
    })

    return () => {
      if (recoverTimerRef.current) {
        window.clearTimeout(recoverTimerRef.current)
        recoverTimerRef.current = null
      }
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [drawVeil])

  useEffect(() => {
    if (reducedMotion || (revealed && !fizzling)) {
      paintVeil(window.performance.now())
      return undefined
    }

    let animationFrame
    let lastPaint = 0
    const animate = (time) => {
      if (time - lastPaint >= 33) {
        const fizzleDirection = fizzleDirectionRef.current
        let completedDirection = null

        if (fizzleStartRef.current !== null && fizzleDirection) {
          const fizzleProgress = Math.min(
            1,
            (time - fizzleStartRef.current) / FIZZLE_DURATION_MS,
          )
          fizzleProgressRef.current = fizzleProgress

          if (fizzleDirection === 'in' || fizzleDirection === 'heal') {
            maskStrengthRef.current = 1 - fizzleProgress
          }
          if (fizzleProgress === 1) completedDirection = fizzleDirection
        }

        paintVeil(time)

        if (completedDirection === 'out') {
          fizzleStartRef.current = null
          setFizzling(false)
          setRevealed(true)
        } else if (completedDirection === 'in' || completedDirection === 'heal') {
          const maskCanvas = maskCanvasRef.current
          const maskContext = maskCanvas?.getContext('2d')
          if (maskCanvas && maskContext) {
            maskContext.setTransform(1, 0, 0, 1, 0, 0)
            maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
          }
          maskStrengthRef.current = 1
          fizzleDirectionRef.current = null
          fizzleProgressRef.current = 0
          fizzleStartRef.current = null
          progressRef.current = 0
          setFizzling(false)
          paintVeil(time)
        }

        lastPaint = time
      }
      animationFrame = window.requestAnimationFrame(animate)
    }
    animationFrame = window.requestAnimationFrame(animate)

    return () => window.cancelAnimationFrame(animationFrame)
  }, [fizzling, paintVeil, reducedMotion, revealed])

  const clearRecoveryTimer = useCallback(() => {
    if (!recoverTimerRef.current) return
    window.clearTimeout(recoverTimerRef.current)
    recoverTimerRef.current = null
  }, [])

  const resetVeil = useCallback(() => {
    clearRecoveryTimer()
    pointerRef.current = null
    progressRef.current = 0
    fizzleDirectionRef.current = null
    fizzleProgressRef.current = 0
    fizzleStartRef.current = null
    maskStrengthRef.current = 1
    setFizzling(false)
    setRevealed(false)
    drawVeil()
  }, [clearRecoveryTimer, drawVeil])

  const beginRecovery = useCallback(() => {
    clearRecoveryTimer()

    if (reducedMotion) {
      resetVeil()
      return
    }

    fizzleDirectionRef.current = revealed ? 'in' : 'heal'
    fizzleProgressRef.current = 0
    fizzleStartRef.current = window.performance.now()
    maskStrengthRef.current = 1
    setFizzling(true)
    if (revealed) setRevealed(false)
  }, [clearRecoveryTimer, reducedMotion, resetVeil, revealed])

  const scheduleRecovery = useCallback(() => {
    clearRecoveryTimer()
    recoverTimerRef.current = window.setTimeout(beginRecovery, RECOVER_DELAY_MS)
  }, [beginRecovery, clearRecoveryTimer])

  const revealAll = useCallback(() => {
    if (fizzleDirectionRef.current === 'out') return

    clearRecoveryTimer()
    pointerRef.current = null
    progressRef.current = REVEAL_THRESHOLD

    if (reducedMotion) {
      fizzleDirectionRef.current = 'out'
      fizzleProgressRef.current = 1
      setRevealed(true)
      return
    }

    fizzleDirectionRef.current = 'out'
    fizzleProgressRef.current = 0
    fizzleStartRef.current = window.performance.now()
    setFizzling(true)
  }, [clearRecoveryTimer, reducedMotion])

  useEffect(() => {
    if (!revealed) return undefined
    scheduleRecovery()
    return clearRecoveryTimer
  }, [clearRecoveryTimer, revealed, scheduleRecovery])

  const eraseAt = useCallback((x, y, distance = 0) => {
    const canvas = canvasRef.current
    const maskCanvas = maskCanvasRef.current
    const metrics = metricsRef.current
    const stage = stageRef.current
    if (!canvas || !maskCanvas || !metrics || !stage) return

    const context = canvas.getContext('2d')
    const maskContext = maskCanvas.getContext('2d')
    if (!context || !maskContext) return

    const stageBounds = stage.getBoundingClientRect()
    const stageWidth = stageBounds.width
    const brushRadius = Math.max(24, stageWidth * 0.075)

    const paintStamp = (targetContext, color, compositeOperation) => {
      targetContext.setTransform(metrics.pixelRatio, 0, 0, metrics.pixelRatio, 0, 0)
      const brush = targetContext.createRadialGradient(x, y, 0, x, y, brushRadius)
      brush.addColorStop(0, color.replace('ALPHA', '1'))
      brush.addColorStop(0.68, color.replace('ALPHA', '0.94'))
      brush.addColorStop(1, color.replace('ALPHA', '0'))
      targetContext.globalAlpha = 1
      targetContext.globalCompositeOperation = compositeOperation
      targetContext.fillStyle = brush
      targetContext.beginPath()
      targetContext.arc(x, y, brushRadius, 0, Math.PI * 2)
      targetContext.fill()
    }

    paintStamp(maskContext, 'rgba(255, 255, 255, ALPHA)', 'source-over')
    paintStamp(context, 'rgba(0, 0, 0, ALPHA)', 'destination-out')

    const fieldArea = stageWidth * stageBounds.height
    const erasedArea = distance > 0
      ? distance * brushRadius * 1.45
      : Math.PI * brushRadius * brushRadius * 0.25
    progressRef.current += erasedArea / fieldArea

    if (progressRef.current >= REVEAL_THRESHOLD) revealAll()
  }, [revealAll])

  const handlePointerDown = (event) => {
    if (revealed || fizzling || (event.pointerType === 'mouse' && event.button !== 0)) return

    event.preventDefault()
    clearRecoveryTimer()
    fizzleDirectionRef.current = null
    fizzleProgressRef.current = 0
    fizzleStartRef.current = null
    maskStrengthRef.current = 1
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    pointerRef.current = { id: event.pointerId, ...point }
    event.currentTarget.setPointerCapture(event.pointerId)
    eraseAt(point.x, point.y)
  }

  const handlePointerMove = (event) => {
    const pointer = pointerRef.current
    if (!pointer || pointer.id !== event.pointerId || revealed || fizzling) return

    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const nextPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const deltaX = nextPoint.x - pointer.x
    const deltaY = nextPoint.y - pointer.y
    const distance = Math.hypot(deltaX, deltaY)
    const steps = Math.max(1, Math.ceil(distance / 12))

    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps
      eraseAt(pointer.x + deltaX * amount, pointer.y + deltaY * amount, distance / steps)
    }

    pointerRef.current = { id: event.pointerId, ...nextPoint }
  }

  const handlePointerEnd = (event) => {
    if (pointerRef.current?.id !== event.pointerId) return
    pointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (fizzleDirectionRef.current !== 'out') scheduleRecovery()
  }

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    revealAll()
  }

  return (
    <section
      className="mx-auto w-full max-w-[calc(100vw-2rem)] pb-3"
      aria-label={`Week ${week} projection reveal`}
    >
      <div ref={stageRef} className="relative mx-auto aspect-[5/6] w-full max-w-md select-none overflow-hidden">
        <div className="absolute inset-0">
          <div
            aria-hidden={!revealed}
            inert={!revealed}
            className={`relative h-full ${revealed ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            {teams.map((team, index) => {
              const isSelected = selectedRosterId === team.rosterId
              const position = FLOAT_POSITIONS[index % FLOAT_POSITIONS.length]
              const drift = DRIFT_PATTERNS[index % DRIFT_PATTERNS.length]

              return (
                <div
                  key={team.rosterId}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={position}
                >
                  <Motion.button
                    type="button"
                    tabIndex={revealed ? 0 : -1}
                    aria-pressed={isSelected}
                    className={`w-[clamp(5.25rem,27vw,7.5rem)] min-h-11 rounded-2xl border px-1.5 py-1 text-center shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/80 bg-card/90 hover:bg-accent'
                    }`}
                    animate={reducedMotion ? undefined : drift}
                    transition={reducedMotion ? undefined : {
                      duration: 7 + (index % 4),
                      ease: 'easeInOut',
                      repeat: Infinity,
                    }}
                    onClick={() => onRosterSelect?.(isSelected ? null : team.rosterId)}
                  >
                    <span className="line-clamp-2 block text-[0.6875rem] font-semibold leading-tight">
                      {team.teamName}
                    </span>
                    <span className={`mt-0.5 block text-[0.625rem] tabular-nums ${
                      isSelected ? 'text-primary-foreground/75' : 'text-muted-foreground'
                    }`}>
                      {team.projectedTotal ?? '--'} pts
                    </span>
                  </Motion.button>
                </div>
              )
            })}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          role="button"
          tabIndex={revealed || fizzling ? -1 : 0}
          aria-label="Swipe across the particle cloud to reveal the projections temporarily. Press Enter or Space to reveal them instantly."
          className={`absolute inset-0 size-full touch-none opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            revealed || fizzling
              ? 'pointer-events-none'
              : 'cursor-grab active:cursor-grabbing'
          }`}
          onKeyDown={handleKeyDown}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
        />

      </div>

      <p className="sr-only" aria-live="polite">
        {revealed ? 'Week projections revealed.' : 'Week projections are hidden.'}
      </p>
    </section>
  )
}

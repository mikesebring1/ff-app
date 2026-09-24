function validWeek(week) {
  const normalized = Number(week)
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null
}

export function isPregameEligibleWeek({ selectedWeek, displayWeek }) {
  const selected = validWeek(selectedWeek)
  const displayed = validWeek(displayWeek)
  return Boolean(selected && displayed && selected >= displayed)
}

export function getPostseasonPreviewState({
  selectedWeek,
  displayWeek,
  playoffWeekStart,
  postseasonFinalWeek,
}) {
  const selected = validWeek(selectedWeek)
  const displayed = validWeek(displayWeek)
  const opening = validWeek(playoffWeekStart)
  const final = validWeek(postseasonFinalWeek)
  const showPreview = Boolean(
    selected
    && displayed
    && opening
    && final
    && displayed < opening
    && selected >= opening
    && selected <= final,
  )

  return {
    showPreview,
    weeklyDataEnabled: !showPreview,
  }
}

export function resolveSelectedWeek({
  selectedWeek,
  displayWeek,
  availableWeeks,
  selectionIsManual = false,
}) {
  const weeks = (availableWeeks ?? [])
    .map(validWeek)
    .filter((week) => week !== null)
  const selected = validWeek(selectedWeek)

  if (selectionIsManual && selected && weeks.includes(selected)) {
    return String(selected)
  }

  const displayed = validWeek(displayWeek)
  if (displayed && weeks.includes(displayed)) {
    return String(displayed)
  }

  if (selected && weeks.includes(selected)) {
    return String(selected)
  }

  return weeks.length > 0 ? String(Math.max(...weeks)) : ''
}

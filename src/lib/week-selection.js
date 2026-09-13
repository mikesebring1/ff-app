function validWeek(week) {
  const normalized = Number(week)
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null
}

export function resolveSelectedWeek({ selectedWeek, currentWeek, availableWeeks }) {
  const weeks = (availableWeeks ?? [])
    .map(validWeek)
    .filter((week) => week !== null)
  const selected = validWeek(selectedWeek)

  if (selected && weeks.includes(selected)) {
    return String(selected)
  }

  const current = validWeek(currentWeek)
  if (current && weeks.includes(current)) {
    return String(current)
  }

  return weeks.length > 0 ? String(Math.max(...weeks)) : ''
}

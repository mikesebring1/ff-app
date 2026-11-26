import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWeeklyReviewResponse } from '../src/lib/weekly-review.js'


test('validates and normalizes a complete weekly review', () => {
  const response = parseWeeklyReviewResponse({
    week: 7,
    generated_at: 1_000,
    model: 'google/gemini-2.5-flash',
    cached: true,
    review: {
      headline: '  The benches fought back  ',
      overview: 'A factual overview.',
      teams: [{
        roster_id: '1',
        team_name: 'Team One',
        rank: 1,
        points: 120.25,
        record: '9-0',
        points_left_on_bench: 4.5,
        lineup_efficiency: 96.4,
        performance: 'First place was good.',
        lineup: 'The starters mostly behaved.',
        verdict: 'Annoyingly competent.',
      }],
    },
  })

  assert.equal(response.review.headline, 'The benches fought back')
  assert.equal(response.review.teams[0].rosterId, '1')
  assert.equal(response.review.teams[0].pointsLeftOnBench, 4.5)
})

test('rejects incomplete weekly review team recaps', () => {
  assert.throws(
    () => parseWeeklyReviewResponse({
      week: 7,
      generated_at: 1_000,
      review: { headline: 'Headline', overview: 'Overview', teams: [] },
    }),
    /team recaps/,
  )
})

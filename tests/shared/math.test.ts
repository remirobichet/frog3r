import { describe, expect, it } from 'vitest'

import { magnitude } from '@shared/utils/math'

describe('magnitude', () => {
  it('returns euclidean length for vector', () => {
    expect(magnitude({ x: 3, y: 4 })).toBe(5)
  })
})

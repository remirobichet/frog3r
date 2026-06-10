import { describe, expect, it } from 'vitest'

import { getAllLevels, getDefaultLevel, getLevelById } from '@shared/levels'

describe('level registry', () => {
  it('registers the Tiled levels', () => {
    const levels = getAllLevels()

    expect(levels).toHaveLength(2)
    expect(levels.map((level) => level.id)).toEqual(['level_0', 'level_1-1'])
  })

  it('parses spawn and platforms from Tiled data', () => {
    const level = getLevelById('level_0')

    expect(level.spawn.x).toBe(180)
    expect(level.spawn.y).toBe(920)
    expect(level.finish.x).toBe(1720)
    expect(level.finish.y).toBe(640)
    expect(level.platforms[0]?.slippery).toBe(false)
    expect(level.platforms[0]?.trampoline).toBe(false)
    expect(level.platforms.length).toBeGreaterThan(1)
    expect(level.worldWidth).toBe(getDefaultLevel().worldWidth)
    expect(level.worldHeight).toBe(getDefaultLevel().worldHeight)
  })

  it('registers a finish marker for every level', () => {
    for (const level of getAllLevels()) {
      expect(level.finish.width).toBeGreaterThan(0)
      expect(level.finish.height).toBeGreaterThan(0)
    }
  })
})

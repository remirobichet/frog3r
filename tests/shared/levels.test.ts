import { describe, expect, it } from 'vitest'

import { getAllLevels, getDefaultLevel, getLevelById } from '@shared/levels'
import { parseTiledLevel } from '@shared/levels/parse-tiled-level'
import type { TiledMap } from '@shared/types/level'

describe('level registry', () => {
  it('registers the Tiled levels', () => {
    const levels = getAllLevels()

    expect(levels).toHaveLength(10)
    expect(levels.map((level) => level.id)).toEqual([
      'level_0',
      'level_1-1',
      'level_1-2',
      'level_1-3',
      'level_2-1',
      'level_2-2',
      'level_2-3',
      'level_3-1',
      'level_3-2',
      'level_3-3',
    ])
  })

  it('parses spawn and platforms from Tiled data', () => {
    const level = getLevelById('level_0')

    expect(level.spawn.x).toBe(180)
    expect(level.spawn.y).toBe(920)
    expect(level.finish.x).toBe(1720)
    expect(level.finish.y).toBe(640)
    expect(level.platforms[0]?.slippery).toBe(false)
    expect(level.platforms[0]?.trampoline).toBe(false)
    expect(level.platforms[0]?.trap).toBe(false)
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

  it('parses moving platform properties from Tiled data', () => {
    const tiledMap: TiledMap = {
      type: 'map',
      width: 10,
      height: 10,
      tilewidth: 40,
      tileheight: 40,
      layers: [
        {
          id: 1,
          name: 'platforms',
          type: 'objectgroup',
          objects: [
            {
              id: 1,
              x: 40,
              y: 200,
              width: 120,
              height: 20,
              properties: [
                { name: 'moving', type: 'bool', value: true },
                { name: 'moveAxis', type: 'string', value: 'y' },
                { name: 'moveDistance', type: 'float', value: 80 },
                { name: 'moveDuration', type: 'float', value: 2.5 },
                { name: 'moveOffset', type: 'float', value: 0.5 },
              ],
            },
          ],
        },
        {
          id: 2,
          name: 'markers',
          type: 'objectgroup',
          objects: [
            { id: 2, name: 'spawn', x: 80, y: 200, point: true },
            { id: 3, name: 'finish', x: 320, y: 200, width: 40, height: 40 },
          ],
        },
      ],
    }

    const parsedLevel = parseTiledLevel('moving-test', tiledMap)

    expect(parsedLevel.platforms[0]?.movement).toEqual({
      axis: 'y',
      distance: 80,
      duration: 2.5,
      offset: 0.5,
    })
  })

  it('parses rotated Tiled objects as axis-aligned platform bounds', () => {
    const tiledMap: TiledMap = {
      type: 'map',
      width: 10,
      height: 10,
      tilewidth: 40,
      tileheight: 40,
      layers: [
        {
          id: 1,
          name: 'platforms',
          type: 'objectgroup',
          objects: [
            {
              id: 1,
              x: 55,
              y: 600,
              width: 200,
              height: 15,
              rotation: 90,
              properties: [{ name: 'trap', type: 'bool', value: true }],
            },
          ],
        },
        {
          id: 2,
          name: 'markers',
          type: 'objectgroup',
          objects: [
            { id: 2, name: 'spawn', x: 80, y: 200, point: true },
            { id: 3, name: 'finish', x: 320, y: 200, width: 40, height: 40 },
          ],
        },
      ],
    }

    const parsedLevel = parseTiledLevel('rotated-test', tiledMap)
    const trap = parsedLevel.platforms[0]

    expect(trap?.trap).toBe(true)
    expect(trap?.x).toBeCloseTo(40)
    expect(trap?.y).toBeCloseTo(600)
    expect(trap?.width).toBeCloseTo(15)
    expect(trap?.height).toBeCloseTo(200)
  })
})

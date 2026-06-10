import levelZeroMap from '@shared/levels/tiled/level_0.json'
import levelOneOneMap from '@shared/levels/tiled/level_1-1.json'
import { parseTiledLevel } from '@shared/levels/parse-tiled-level'
import type { LevelData, LevelSummary } from '@shared/types/level'

const allLevels: LevelData[] = [
  parseTiledLevel('level_0', levelZeroMap),
  parseTiledLevel('level_1-1', levelOneOneMap),
]

const [defaultLevel] = allLevels

if (!defaultLevel) {
  throw new Error('At least one level must be registered')
}

for (const level of allLevels) {
  if (level.worldWidth !== defaultLevel.worldWidth || level.worldHeight !== defaultLevel.worldHeight) {
    throw new Error('All levels must share the same world dimensions in v1')
  }
}

const levelById = new Map(allLevels.map((level) => [level.id, level]))

export const defaultLevelId = defaultLevel.id
export const availableLevels: LevelSummary[] = allLevels.map((level) => ({
  id: level.id,
  name: level.name,
}))

export function getDefaultLevel(): LevelData {
  return defaultLevel
}

export function getAllLevels(): LevelData[] {
  return allLevels
}

export function getLevelById(levelId: string): LevelData {
  return levelById.get(levelId) ?? defaultLevel
}

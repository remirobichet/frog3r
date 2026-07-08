import type { Vector2 } from '@shared/types/game-state'
import type { Platform } from '@shared/types/level'

export function getPlatformPosition(platform: Platform, elapsedSeconds: number): Vector2 {
  if (!platform.movement) {
    return { x: platform.x, y: platform.y }
  }

  const phaseSeconds =
    ((elapsedSeconds + platform.movement.offset) % platform.movement.duration
      + platform.movement.duration) % platform.movement.duration
  const progress = phaseSeconds / platform.movement.duration
  const movementRatio = progress <= 0.5 ? progress * 2 : (1 - progress) * 2
  const movementOffset = platform.movement.distance * movementRatio

  return platform.movement.axis === 'x'
    ? { x: platform.x + movementOffset, y: platform.y }
    : { x: platform.x, y: platform.y + movementOffset }
}

export function getPlatformAtElapsed(platform: Platform, elapsedSeconds: number): Platform {
  const position = getPlatformPosition(platform, elapsedSeconds)

  return {
    ...platform,
    x: position.x,
    y: position.y,
  }
}

export function getPlatformDelta(
  platform: Platform,
  previousElapsedSeconds: number,
  nextElapsedSeconds: number,
): Vector2 {
  const previousPosition = getPlatformPosition(platform, previousElapsedSeconds)
  const nextPosition = getPlatformPosition(platform, nextElapsedSeconds)

  return {
    x: nextPosition.x - previousPosition.x,
    y: nextPosition.y - previousPosition.y,
  }
}

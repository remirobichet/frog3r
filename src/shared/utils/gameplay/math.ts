import type { Vector2 } from '@shared/types/game-state'

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalize(vector: Vector2): Vector2 {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y)
  if (length === 0) {
    return { x: 0, y: -1 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

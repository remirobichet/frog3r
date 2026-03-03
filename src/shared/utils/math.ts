import type { Vector2 } from '@shared/types/game-state'

export function magnitude(vector: Vector2): number {
  return Math.sqrt((vector.x * vector.x) + (vector.y * vector.y))
}

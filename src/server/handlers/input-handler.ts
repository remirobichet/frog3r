import type { GameState } from '@shared/types/game-state'

export interface PlayerInput {
  directionX: number
  directionY: number
  power: number
}

export function applyInput(state: GameState, input: PlayerInput): GameState {
  return {
    ...state,
    jumpDirection: { x: input.directionX, y: input.directionY },
    jumpPower: input.power,
  }
}

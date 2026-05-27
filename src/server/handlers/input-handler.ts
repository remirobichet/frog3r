import type { GameState } from '../../shared/types/game-state'
import { launchJump, triggerMidAirJump, updateCharge, updateDirection } from '../../shared/utils/gameplay'

export interface PlayerInput {
  directionX: number
  directionY: number
  charging: boolean
  launchRequested: boolean
  miniJumpRequested: boolean
  deltaSeconds: number
}

export function applyInput(state: GameState, input: PlayerInput): GameState {
  let nextState = updateDirection(state, { x: input.directionX, y: input.directionY })
  nextState = updateCharge(nextState, input.deltaSeconds, input.charging)

  if (input.launchRequested) {
    nextState = launchJump(nextState)
  }

  if (input.miniJumpRequested) {
    nextState = triggerMidAirJump(nextState)
  }

  return nextState
}

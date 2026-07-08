import {
  chargeRate,
  frogRadius,
  horizontalSpeedFactor,
  maxJumpPower,
  miniJumpHorizontalBoost,
  miniJumpVerticalBoost,
  minJumpPower,
} from '@shared/constants/game'
import type { FrogRunState, GameState, Vector2 } from '@shared/types/game-state'
import type { LevelData } from '@shared/types/level'

import { clamp, normalize } from './math'

export function updateDirection(
  state: GameState,
  direction: Vector2,
): GameState
export function updateDirection(
  state: FrogRunState,
  direction: Vector2,
): FrogRunState
export function updateDirection(
  state: FrogRunState,
  direction: Vector2,
): FrogRunState {
  if (state.phase !== 'charging') {
    return state
  }

  const normalizedDirection = normalize(direction)
  return {
    ...state,
    activeDirection: normalizedDirection,
    jumpDirection: normalizedDirection,
  }
}

export function debugTeleportFrog(
  state: GameState,
  position: Vector2,
  level: LevelData,
): GameState
export function debugTeleportFrog(
  state: FrogRunState,
  position: Vector2,
  level: LevelData,
): FrogRunState
export function debugTeleportFrog(
  state: FrogRunState,
  position: Vector2,
  level: LevelData,
): FrogRunState {
  return {
    ...state,
    phase: 'airborne',
    frog: {
      position: {
        x: clamp(position.x, frogRadius, level.worldWidth - frogRadius),
        y: clamp(position.y, 0, level.worldHeight),
      },
      velocity: { x: 0, y: 0 },
    },
    jumpPower: minJumpPower,
    midAirJumpUsed: false,
    resetNotice: null,
  }
}

export function updateCharge(
  state: GameState,
  deltaSeconds: number,
  charging: boolean,
): GameState
export function updateCharge(
  state: FrogRunState,
  deltaSeconds: number,
  charging: boolean,
): FrogRunState
export function updateCharge(
  state: FrogRunState,
  deltaSeconds: number,
  charging: boolean,
): FrogRunState {
  if (!charging || state.phase !== 'charging') {
    return state
  }

  return {
    ...state,
    jumpPower: clamp(
      state.jumpPower + chargeRate * deltaSeconds,
      minJumpPower,
      maxJumpPower,
    ),
  }
}

export function launchJump(state: GameState): GameState
export function launchJump(state: FrogRunState): FrogRunState
export function launchJump(state: FrogRunState): FrogRunState {
  if (state.phase !== 'charging') {
    return state
  }

  const direction = normalize({
    x: state.jumpDirection.x,
    y: Math.min(state.jumpDirection.y, -0.1),
  })

  return {
    ...state,
    phase: 'airborne',
    frog: {
      ...state.frog,
      velocity: {
        x:
          state.frog.velocity.x +
          direction.x * state.jumpPower * horizontalSpeedFactor,
        y: direction.y * state.jumpPower,
      },
    },
  }
}

export function triggerMidAirJump(state: GameState): GameState
export function triggerMidAirJump(state: FrogRunState): FrogRunState
export function triggerMidAirJump(state: FrogRunState): FrogRunState {
  if (state.phase !== 'airborne' || state.midAirJumpUsed) {
    return state
  }

  const horizontalDirection =
    state.frog.velocity.x === 0 ? 1 : Math.sign(state.frog.velocity.x)

  return {
    ...state,
    midAirJumpUsed: true,
    frog: {
      ...state.frog,
      velocity: {
        x:
          state.frog.velocity.x + horizontalDirection * miniJumpHorizontalBoost,
        y: Math.min(state.frog.velocity.y - miniJumpVerticalBoost, -150),
      },
    },
  }
}

import {
  chargeRate,
  gravity,
  groundY,
  horizontalSpeedFactor,
  maxJumpPower,
  miniJumpHorizontalBoost,
  miniJumpVerticalBoost,
  minJumpPower,
  worldWidth,
} from '@shared/constants/game'
import type { GameState, PlayerId, PlayerRole, Vector2 } from '@shared/types/game-state'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.sqrt((vector.x * vector.x) + (vector.y * vector.y))
  if (length === 0) {
    return { x: 0, y: -1 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function swapRoles(roles: Record<PlayerId, PlayerRole>): Record<PlayerId, PlayerRole> {
  return {
    player1: roles.player1 === 'direction' ? 'power' : 'direction',
    player2: roles.player2 === 'direction' ? 'power' : 'direction',
  }
}

export function createInitialGameState(): GameState {
  return {
    phase: 'charging',
    frog: {
      position: { x: 180, y: groundY },
      velocity: { x: 0, y: 0 },
    },
    activeDirection: { x: 0, y: -1 },
    jumpDirection: { x: 0, y: -1 },
    jumpPower: minJumpPower,
    roles: {
      player1: 'direction',
      player2: 'power',
    },
    midAirJumpUsed: false,
    jumpCount: 0,
  }
}

export function updateDirection(state: GameState, direction: Vector2): GameState {
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

export function updateCharge(state: GameState, deltaSeconds: number, charging: boolean): GameState {
  if (!charging || state.phase !== 'charging') {
    return state
  }

  return {
    ...state,
    jumpPower: clamp(state.jumpPower + (chargeRate * deltaSeconds), minJumpPower, maxJumpPower),
  }
}

export function launchJump(state: GameState): GameState {
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
        x: direction.x * state.jumpPower * horizontalSpeedFactor,
        y: direction.y * state.jumpPower,
      },
    },
  }
}

export function triggerMidAirJump(state: GameState): GameState {
  if (state.phase !== 'airborne' || state.midAirJumpUsed) {
    return state
  }

  const horizontalDirection = state.frog.velocity.x === 0 ? 1 : Math.sign(state.frog.velocity.x)

  return {
    ...state,
    midAirJumpUsed: true,
    frog: {
      ...state.frog,
      velocity: {
        x: state.frog.velocity.x + (horizontalDirection * miniJumpHorizontalBoost),
        y: Math.min(state.frog.velocity.y - miniJumpVerticalBoost, -150),
      },
    },
  }
}

export function simulateTick(state: GameState, deltaSeconds: number): GameState {
  if (state.phase !== 'airborne') {
    return state
  }

  const nextVelocity = {
    x: state.frog.velocity.x,
    y: state.frog.velocity.y + (gravity * deltaSeconds),
  }
  const nextPosition = {
    x: clamp(state.frog.position.x + (nextVelocity.x * deltaSeconds), 24, worldWidth - 24),
    y: state.frog.position.y + (nextVelocity.y * deltaSeconds),
  }

  if (nextPosition.y < groundY) {
    return {
      ...state,
      frog: {
        position: nextPosition,
        velocity: nextVelocity,
      },
    }
  }

  return {
    ...state,
    phase: 'charging',
    frog: {
      position: {
        x: nextPosition.x,
        y: groundY,
      },
      velocity: { x: 0, y: 0 },
    },
    jumpPower: minJumpPower,
    midAirJumpUsed: false,
    jumpCount: state.jumpCount + 1,
    roles: swapRoles(state.roles),
  }
}

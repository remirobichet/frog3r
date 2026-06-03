import {
  chargeRate,
  frogRadius,
  gravity,
  horizontalSpeedFactor,
  maxJumpPower,
  miniJumpHorizontalBoost,
  miniJumpVerticalBoost,
  minJumpPower,
} from '@shared/constants/game'
import type { LevelData, Platform } from '@shared/types/level'
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

function rotateRoles(roles: Record<PlayerId, PlayerRole>): Record<PlayerId, PlayerRole> {
  return {
    player1: roles.player1 === 'direction'
      ? 'power'
      : roles.player1 === 'power'
        ? 'midJump'
        : 'direction',
    player2: roles.player2 === 'direction'
      ? 'power'
      : roles.player2 === 'power'
        ? 'midJump'
        : 'direction',
    player3: roles.player3 === 'direction'
      ? 'power'
      : roles.player3 === 'power'
        ? 'midJump'
        : 'direction',
  }
}

function overlapsPlatform(platform: Platform, x: number): boolean {
  return (x + frogRadius) > platform.x && (x - frogRadius) < (platform.x + platform.width)
}

function overlapsFinish(finish: Platform, position: Vector2): boolean {
  const verticalLandingTolerance = 8

  return (position.x + frogRadius) > finish.x
    && (position.x - frogRadius) < finish.x + finish.width
    && position.y >= finish.y
    && position.y <= finish.y + finish.height + verticalLandingTolerance
}

function findLandingHeight(
  previousPosition: Vector2,
  nextPosition: Vector2,
  level: LevelData,
): number | null {
  if (nextPosition.y < previousPosition.y) {
    return null
  }

  let landingHeight: number | null = null

  for (const platform of level.platforms) {
    if (!overlapsPlatform(platform, nextPosition.x)) {
      continue
    }

    if (previousPosition.y <= platform.y && nextPosition.y >= platform.y) {
      landingHeight = landingHeight === null ? platform.y : Math.min(landingHeight, platform.y)
    }
  }

  return landingHeight
}

export function createInitialGameState(level: LevelData): GameState {
  return {
    phase: 'charging',
    frog: {
      position: { x: level.spawn.x, y: level.spawn.y },
      velocity: { x: 0, y: 0 },
    },
    activeDirection: { x: 0, y: -1 },
    jumpDirection: { x: 0, y: -1 },
    jumpPower: minJumpPower,
    roles: {
      player1: 'direction',
      player2: 'power',
      player3: 'midJump',
    },
    midAirJumpUsed: false,
    jumpCount: 0,
    finishedAtJumpCount: null,
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

export function simulateTick(state: GameState, deltaSeconds: number, level: LevelData): GameState {
  if (state.phase !== 'airborne') {
    return state
  }

  const nextVelocity = {
    x: state.frog.velocity.x,
    y: state.frog.velocity.y + (gravity * deltaSeconds),
  }
  const nextPosition = {
    x: clamp(
      state.frog.position.x + (nextVelocity.x * deltaSeconds),
      frogRadius,
      level.worldWidth - frogRadius,
    ),
    y: state.frog.position.y + (nextVelocity.y * deltaSeconds),
  }
  const landingHeight = findLandingHeight(state.frog.position, nextPosition, level)

  if (landingHeight === null) {
    return {
      ...state,
      frog: {
        position: nextPosition,
        velocity: nextVelocity,
      },
    }
  }

  const landedPosition = {
    x: nextPosition.x,
    y: landingHeight,
  }
  const nextJumpCount = state.jumpCount + 1

  if (overlapsFinish(level.finish, landedPosition)) {
    return {
      ...state,
      phase: 'finished',
      frog: {
        position: landedPosition,
        velocity: { x: 0, y: 0 },
      },
      jumpCount: nextJumpCount,
      finishedAtJumpCount: nextJumpCount,
    }
  }

  return {
    ...state,
    phase: 'charging',
    frog: {
      position: landedPosition,
      velocity: { x: 0, y: 0 },
    },
    jumpPower: minJumpPower,
    midAirJumpUsed: false,
    jumpCount: nextJumpCount,
    roles: rotateRoles(state.roles),
  }
}

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
import type {
  GameState,
  PlayerId,
  PlayerRole,
  Vector2,
} from '@shared/types/game-state'

interface CollisionResult {
  position: Vector2
  velocity: Vector2
  landingHeight: number | null
  landingPlatform: Platform | null
}

const frogCollisionHeight = frogRadius * 2
const slipperyPlatformFriction = 120
const slipperyPlatformStopSpeed = 8
const trampolineBounceVelocity = 850

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y)
  if (length === 0) {
    return { x: 0, y: -1 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function rotateRoles(
  roles: Record<PlayerId, PlayerRole>,
): Record<PlayerId, PlayerRole> {
  return {
    player1:
      roles.player1 === 'direction'
        ? 'power'
        : roles.player1 === 'power'
          ? 'midJump'
          : 'direction',
    player2:
      roles.player2 === 'direction'
        ? 'power'
        : roles.player2 === 'power'
          ? 'midJump'
          : 'direction',
    player3:
      roles.player3 === 'direction'
        ? 'power'
        : roles.player3 === 'power'
          ? 'midJump'
          : 'direction',
  }
}

function overlapsPlatform(platform: Platform, x: number): boolean {
  return (
    x + frogRadius > platform.x && x - frogRadius < platform.x + platform.width
  )
}

function overlapsPlatformVertically(platform: Platform, y: number): boolean {
  return (
    y > platform.y && y - frogCollisionHeight < platform.y + platform.height
  )
}

function overlapsFinish(finish: Platform, position: Vector2): boolean {
  const verticalLandingTolerance = 8

  return (
    position.x + frogRadius > finish.x &&
    position.x - frogRadius < finish.x + finish.width &&
    position.y >= finish.y &&
    position.y <= finish.y + finish.height + verticalLandingTolerance
  )
}

function findLandingPlatform(
  previousPosition: Vector2,
  nextPosition: Vector2,
  level: LevelData,
): Platform | null {
  if (nextPosition.y < previousPosition.y) {
    return null
  }

  let landingPlatform: Platform | null = null

  for (const platform of level.platforms) {
    if (!overlapsPlatform(platform, nextPosition.x)) {
      continue
    }

    if (previousPosition.y <= platform.y && nextPosition.y >= platform.y) {
      landingPlatform =
        landingPlatform === null || platform.y < landingPlatform.y
          ? platform
          : landingPlatform
    }
  }

  return landingPlatform
}

function findSupportedPlatform(
  position: Vector2,
  level: LevelData,
): Platform | null {
  for (const platform of level.platforms) {
    if (Math.abs(position.y - platform.y) > 0.5) {
      continue
    }

    if (overlapsPlatform(platform, position.x)) {
      return platform
    }
  }

  return null
}

function applyHorizontalFriction(
  velocityX: number,
  deltaSeconds: number,
): number {
  const speed = Math.abs(velocityX)
  const nextSpeed = Math.max(0, speed - slipperyPlatformFriction * deltaSeconds)

  if (nextSpeed < slipperyPlatformStopSpeed) {
    return 0
  }

  return Math.sign(velocityX) * nextSpeed
}

function resolvePlatformCollisions(
  previousPosition: Vector2,
  nextPosition: Vector2,
  nextVelocity: Vector2,
  level: LevelData,
): CollisionResult {
  let resolvedPosition = { ...nextPosition }
  let resolvedVelocity = { ...nextVelocity }

  for (const platform of level.platforms) {
    if (!overlapsPlatformVertically(platform, resolvedPosition.y)) {
      continue
    }

    const previousRight = previousPosition.x + frogRadius
    const previousLeft = previousPosition.x - frogRadius
    const nextRight = resolvedPosition.x + frogRadius
    const nextLeft = resolvedPosition.x - frogRadius

    if (
      resolvedVelocity.x > 0 &&
      previousRight <= platform.x &&
      nextRight >= platform.x
    ) {
      resolvedPosition = {
        ...resolvedPosition,
        x: platform.x - frogRadius,
      }
      resolvedVelocity = {
        ...resolvedVelocity,
        x: 0,
      }
    }

    if (
      resolvedVelocity.x < 0 &&
      previousLeft >= platform.x + platform.width &&
      nextLeft <= platform.x + platform.width
    ) {
      resolvedPosition = {
        ...resolvedPosition,
        x: platform.x + platform.width + frogRadius,
      }
      resolvedVelocity = {
        ...resolvedVelocity,
        x: 0,
      }
    }
  }

  let landingPlatform = findLandingPlatform(
    previousPosition,
    resolvedPosition,
    level,
  )
  if (landingPlatform !== null) {
    resolvedPosition = {
      ...resolvedPosition,
      y: landingPlatform.y,
    }
    resolvedVelocity = {
      x:
        landingPlatform.slippery || landingPlatform.trampoline
          ? resolvedVelocity.x
          : 0,
      y: landingPlatform.trampoline ? -trampolineBounceVelocity : 0,
    }

    return {
      position: resolvedPosition,
      velocity: resolvedVelocity,
      landingHeight: landingPlatform.y,
      landingPlatform,
    }
  }

  for (const platform of level.platforms) {
    if (
      !overlapsPlatform(platform, resolvedPosition.x) ||
      resolvedVelocity.y >= 0
    ) {
      continue
    }

    const platformBottom = platform.y + platform.height
    const previousTop = previousPosition.y - frogCollisionHeight
    const nextTop = resolvedPosition.y - frogCollisionHeight
    if (previousTop >= platformBottom && nextTop <= platformBottom) {
      resolvedPosition = {
        ...resolvedPosition,
        y: platformBottom + frogCollisionHeight,
      }
      resolvedVelocity = {
        ...resolvedVelocity,
        y: 0,
      }
    }
  }

  landingPlatform = findLandingPlatform(
    previousPosition,
    resolvedPosition,
    level,
  )

  return {
    position: resolvedPosition,
    velocity: resolvedVelocity,
    landingHeight: landingPlatform?.y ?? null,
    landingPlatform,
  }
}

function simulateGroundSlide(
  state: GameState,
  deltaSeconds: number,
  level: LevelData,
): GameState {
  const supportedPlatform = findSupportedPlatform(state.frog.position, level)
  if (!supportedPlatform?.slippery || state.frog.velocity.x === 0) {
    return state.frog.velocity.x === 0
      ? state
      : {
          ...state,
          frog: {
            ...state.frog,
            velocity: { x: 0, y: 0 },
          },
        }
  }

  const nextX = state.frog.position.x + state.frog.velocity.x * deltaSeconds
  const clampedX = clamp(nextX, frogRadius, level.worldWidth - frogRadius)
  const movedPosition = {
    x: clampedX,
    y: state.frog.position.y,
  }
  const nextSupportedPlatform = findSupportedPlatform(movedPosition, level)
  const hitWorldEdge = clampedX !== nextX

  if (!nextSupportedPlatform) {
    return {
      ...state,
      phase: 'airborne',
      frog: {
        position: movedPosition,
        velocity: {
          x: hitWorldEdge ? 0 : state.frog.velocity.x,
          y: 0,
        },
      },
    }
  }

  return {
    ...state,
    frog: {
      position: movedPosition,
      velocity: {
        x:
          hitWorldEdge || !nextSupportedPlatform.slippery
            ? 0
            : applyHorizontalFriction(state.frog.velocity.x, deltaSeconds),
        y: 0,
      },
    },
  }
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

export function updateDirection(
  state: GameState,
  direction: Vector2,
): GameState {
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

export function updateCharge(
  state: GameState,
  deltaSeconds: number,
  charging: boolean,
): GameState {
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
        x:
          state.frog.velocity.x +
          direction.x * state.jumpPower * horizontalSpeedFactor,
        y: direction.y * state.jumpPower,
      },
    },
  }
}

export function triggerMidAirJump(state: GameState): GameState {
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

export function simulateTick(
  state: GameState,
  deltaSeconds: number,
  level: LevelData,
): GameState {
  if (state.phase === 'charging') {
    return simulateGroundSlide(state, deltaSeconds, level)
  }

  if (state.phase !== 'airborne') {
    return state
  }

  const nextVelocity = {
    x: state.frog.velocity.x,
    y: state.frog.velocity.y + gravity * deltaSeconds,
  }
  const nextX = state.frog.position.x + nextVelocity.x * deltaSeconds
  const clampedX = clamp(nextX, frogRadius, level.worldWidth - frogRadius)
  const nextVelocityAfterWorldCollision = {
    ...nextVelocity,
    x: clampedX === nextX ? nextVelocity.x : 0,
  }
  const nextPosition = {
    x: clampedX,
    y: state.frog.position.y + nextVelocityAfterWorldCollision.y * deltaSeconds,
  }
  const collision = resolvePlatformCollisions(
    state.frog.position,
    nextPosition,
    nextVelocityAfterWorldCollision,
    level,
  )

  if (collision.landingHeight === null) {
    return {
      ...state,
      frog: {
        position: collision.position,
        velocity: collision.velocity,
      },
    }
  }

  const landedPosition = {
    x: collision.position.x,
    y: collision.landingHeight,
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

  if (collision.landingPlatform?.trampoline) {
    return {
      ...state,
      phase: 'airborne',
      frog: {
        position: landedPosition,
        velocity: collision.velocity,
      },
    }
  }

  return {
    ...state,
    phase: 'charging',
    frog: {
      position: landedPosition,
      velocity: collision.velocity,
    },
    jumpPower: minJumpPower,
    midAirJumpUsed: false,
    jumpCount: nextJumpCount,
    roles: rotateRoles(state.roles),
  }
}

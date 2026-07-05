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
  CoopPlayerId,
  FrogRunState,
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
const sideTrampolineBounceDamping = 0.75
const resetNoticeDurationSeconds = 3
const resetNoticeEpsilonSeconds = 1 / 120
const outOfBoundsMessage = 'The frog fell out. Restarting from the beginning.'
const trapMessage = 'The frog hit a trap. Restarting from the beginning.'

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

function getPlatformAtElapsed(platform: Platform, elapsedSeconds: number): Platform {
  const position = getPlatformPosition(platform, elapsedSeconds)

  return {
    ...platform,
    x: position.x,
    y: position.y,
  }
}

function getPlatformDelta(
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
  roles: Record<CoopPlayerId, PlayerRole>,
): Record<CoopPlayerId, PlayerRole> {
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

function overlapsPlatformVerticallyDuringSideHit(
  platform: Platform,
  previousPosition: Vector2,
  nextPosition: Vector2,
  previousEdge: number,
  nextEdge: number,
  platformEdge: number,
): boolean {
  if (previousEdge === nextEdge) {
    return overlapsPlatformVertically(platform, nextPosition.y)
  }

  const collisionRatio = clamp(
    (platformEdge - previousEdge) / (nextEdge - previousEdge),
    0,
    1,
  )
  const collisionY = previousPosition.y +
    (nextPosition.y - previousPosition.y) * collisionRatio

  return overlapsPlatformVertically(platform, collisionY)
}

function overlapsPlatformBody(platform: Platform, position: Vector2): boolean {
  return (
    position.x + frogRadius > platform.x &&
    position.x - frogRadius < platform.x + platform.width &&
    position.y > platform.y &&
    position.y - frogCollisionHeight < platform.y + platform.height
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

function crossesFinish(
  finish: Platform,
  previousPosition: Vector2,
  nextPosition: Vector2,
): boolean {
  const verticalLandingTolerance = 8
  const minX = finish.x - frogRadius
  const maxX = finish.x + finish.width + frogRadius
  const minY = finish.y
  const maxY = finish.y + finish.height + verticalLandingTolerance
  const deltaX = nextPosition.x - previousPosition.x
  const deltaY = nextPosition.y - previousPosition.y
  let entryRatio = 0
  let exitRatio = 1

  const updateAxis = (
    start: number,
    delta: number,
    min: number,
    max: number,
  ): boolean => {
    if (delta === 0) {
      return start >= min && start <= max
    }

    const firstRatio = (min - start) / delta
    const secondRatio = (max - start) / delta
    entryRatio = Math.max(entryRatio, Math.min(firstRatio, secondRatio))
    exitRatio = Math.min(exitRatio, Math.max(firstRatio, secondRatio))

    return entryRatio <= exitRatio
  }

  return (
    updateAxis(previousPosition.x, deltaX, minX, maxX) &&
    updateAxis(previousPosition.y, deltaY, minY, maxY) &&
    exitRatio >= 0 &&
    entryRatio <= 1
  )
}

function finishRunAtPosition(state: FrogRunState, position: Vector2): FrogRunState {
  return {
    ...state,
    phase: 'finished',
    frog: {
      position,
      velocity: { x: 0, y: 0 },
    },
    finishedAtJumpCount: state.jumpCount,
  }
}

function findLandingPlatform(
  previousPosition: Vector2,
  nextPosition: Vector2,
  level: LevelData,
  elapsedSeconds: number,
): Platform | null {
  if (nextPosition.y < previousPosition.y) {
    return null
  }

  let landingPlatform: Platform | null = null

  for (const levelPlatform of level.platforms) {
    const platform = getPlatformAtElapsed(levelPlatform, elapsedSeconds)
    if (platform.trap) {
      continue
    }

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
  elapsedSeconds: number,
): Platform | null {
  for (const levelPlatform of level.platforms) {
    const platform = getPlatformAtElapsed(levelPlatform, elapsedSeconds)
    if (platform.trap) {
      continue
    }

    if (Math.abs(position.y - platform.y) > 0.5) {
      continue
    }

    if (overlapsPlatform(platform, position.x)) {
      return levelPlatform
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

function applySideTrampolineBounce(velocity: Vector2, direction: -1 | 1): Vector2 {
  return {
    ...velocity,
    x: direction * Math.abs(velocity.x) * sideTrampolineBounceDamping,
  }
}

function isOutOfBounds(position: Vector2, level: LevelData): boolean {
  return (
    position.x + frogRadius < 0 ||
    position.x - frogRadius > level.worldWidth ||
    position.y - frogCollisionHeight > level.worldHeight
  )
}

function overlapsTrap(
  position: Vector2,
  level: LevelData,
  elapsedSeconds: number,
): boolean {
  return level.platforms.some(
    (platform) => platform.trap && overlapsPlatformBody(
      getPlatformAtElapsed(platform, elapsedSeconds),
      position,
    ),
  )
}

function crossesPlatformBody(
  platform: Platform,
  previousPosition: Vector2,
  nextPosition: Vector2,
): boolean {
  const minX = platform.x - frogRadius
  const maxX = platform.x + platform.width + frogRadius
  const minY = platform.y
  const maxY = platform.y + platform.height + frogCollisionHeight
  const deltaX = nextPosition.x - previousPosition.x
  const deltaY = nextPosition.y - previousPosition.y
  let entryRatio = 0
  let exitRatio = 1

  const updateAxis = (
    start: number,
    delta: number,
    min: number,
    max: number,
  ): boolean => {
    if (delta === 0) {
      return start > min && start < max
    }

    const firstRatio = (min - start) / delta
    const secondRatio = (max - start) / delta
    entryRatio = Math.max(entryRatio, Math.min(firstRatio, secondRatio))
    exitRatio = Math.min(exitRatio, Math.max(firstRatio, secondRatio))

    return entryRatio <= exitRatio
  }

  return (
    updateAxis(previousPosition.x, deltaX, minX, maxX) &&
    updateAxis(previousPosition.y, deltaY, minY, maxY) &&
    exitRatio >= 0 &&
    entryRatio <= 1
  )
}

function crossesTrap(
  previousPosition: Vector2,
  nextPosition: Vector2,
  level: LevelData,
  elapsedSeconds: number,
): boolean {
  return level.platforms.some(
    (platform) => platform.trap && crossesPlatformBody(
      getPlatformAtElapsed(platform, elapsedSeconds),
      previousPosition,
      nextPosition,
    ),
  )
}

function tickResetNotice(state: FrogRunState, deltaSeconds: number): FrogRunState {
  if (!state.resetNotice) {
    return state
  }

  const remainingSeconds = Math.max(
    0,
    state.resetNotice.remainingSeconds - deltaSeconds,
  )

  return {
    ...state,
    resetNotice:
      remainingSeconds > resetNoticeEpsilonSeconds
        ? {
            ...state.resetNotice,
            remainingSeconds,
          }
        : null,
  }
}

function resetLevelAfterFailure(
  state: FrogRunState,
  level: LevelData,
  message: string,
): FrogRunState {
  return {
    ...createInitialFrogRunState(level),
    resetNotice: {
      message,
      remainingSeconds: resetNoticeDurationSeconds,
    },
  }
}

function startTrapResetCountdown(
  state: FrogRunState,
  position: Vector2,
): FrogRunState {
  return {
    ...state,
    phase: 'resetting',
    frog: {
      position,
      velocity: { x: 0, y: 0 },
    },
    resetNotice: {
      message: trapMessage,
      remainingSeconds: resetNoticeDurationSeconds,
    },
  }
}

function resolvePlatformCollisions(
  previousPosition: Vector2,
  nextPosition: Vector2,
  nextVelocity: Vector2,
  level: LevelData,
  elapsedSeconds: number,
): CollisionResult {
  let resolvedPosition = { ...nextPosition }
  let resolvedVelocity = { ...nextVelocity }

  const sideCollision = resolvePlatformSideCollisions(
    previousPosition,
    resolvedPosition,
    resolvedVelocity,
    level,
    elapsedSeconds,
  )
  resolvedPosition = sideCollision.position
  resolvedVelocity = sideCollision.velocity

  let landingPlatform = findLandingPlatform(
    previousPosition,
    resolvedPosition,
    level,
    elapsedSeconds,
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

  for (const levelPlatform of level.platforms) {
    const platform = getPlatformAtElapsed(levelPlatform, elapsedSeconds)
    if (platform.trap) {
      continue
    }

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
    elapsedSeconds,
  )

  return {
    position: resolvedPosition,
    velocity: resolvedVelocity,
    landingHeight: landingPlatform?.y ?? null,
    landingPlatform,
  }
}

function resolvePlatformSideCollisions(
  previousPosition: Vector2,
  nextPosition: Vector2,
  nextVelocity: Vector2,
  level: LevelData,
  elapsedSeconds: number,
): Pick<CollisionResult, 'position' | 'velocity'> {
  let resolvedPosition = { ...nextPosition }
  let resolvedVelocity = { ...nextVelocity }

  for (const levelPlatform of level.platforms) {
    const platform = getPlatformAtElapsed(levelPlatform, elapsedSeconds)
    if (platform.trap) {
      continue
    }

    const previousRight = previousPosition.x + frogRadius
    const previousLeft = previousPosition.x - frogRadius
    const nextRight = resolvedPosition.x + frogRadius
    const nextLeft = resolvedPosition.x - frogRadius

    if (
      resolvedVelocity.x > 0 &&
      previousRight <= platform.x &&
      nextRight >= platform.x &&
      overlapsPlatformVerticallyDuringSideHit(
        platform,
        previousPosition,
        resolvedPosition,
        previousRight,
        nextRight,
        platform.x,
      )
    ) {
      resolvedPosition = {
        ...resolvedPosition,
        x: platform.x - frogRadius,
      }
      resolvedVelocity = {
        ...resolvedVelocity,
        ...(platform.trampoline
          ? applySideTrampolineBounce(resolvedVelocity, -1)
          : { x: 0 }),
      }
    }

    if (
      resolvedVelocity.x < 0 &&
      previousLeft >= platform.x + platform.width &&
      nextLeft <= platform.x + platform.width &&
      overlapsPlatformVerticallyDuringSideHit(
        platform,
        previousPosition,
        resolvedPosition,
        previousLeft,
        nextLeft,
        platform.x + platform.width,
      )
    ) {
      resolvedPosition = {
        ...resolvedPosition,
        x: platform.x + platform.width + frogRadius,
      }
      resolvedVelocity = {
        ...resolvedVelocity,
        ...(platform.trampoline
          ? applySideTrampolineBounce(resolvedVelocity, 1)
          : { x: 0 }),
      }
    }
  }

  return {
    position: resolvedPosition,
    velocity: resolvedVelocity,
  }
}

function simulateGroundSlide(
  state: FrogRunState,
  deltaSeconds: number,
  level: LevelData,
): FrogRunState {
  const previousElapsedSeconds = state.elapsedSeconds - deltaSeconds
  const supportedPlatform = findSupportedPlatform(
    state.frog.position,
    level,
    previousElapsedSeconds,
  )
  const platformDelta = supportedPlatform?.movement
    ? getPlatformDelta(supportedPlatform, previousElapsedSeconds, state.elapsedSeconds)
    : { x: 0, y: 0 }

  if (!supportedPlatform?.slippery || state.frog.velocity.x === 0) {
    if (state.frog.velocity.x === 0 && platformDelta.x === 0 && platformDelta.y === 0) {
      return state
    }

    const movedPosition = {
      x: clamp(
        state.frog.position.x + platformDelta.x,
        frogRadius,
        level.worldWidth - frogRadius,
      ),
      y: state.frog.position.y + platformDelta.y,
    }

    if (
      overlapsFinish(level.finish, movedPosition) ||
      crossesFinish(level.finish, state.frog.position, movedPosition)
    ) {
      return finishRunAtPosition(state, movedPosition)
    }

    return {
      ...state,
      frog: {
        ...state.frog,
        position: movedPosition,
        velocity: { x: 0, y: 0 },
      },
    }
  }

  const nextX = state.frog.position.x + platformDelta.x + state.frog.velocity.x * deltaSeconds
  const clampedX = clamp(nextX, frogRadius, level.worldWidth - frogRadius)
  const hitWorldEdge = clampedX !== nextX
  const movedPosition = {
    x: clampedX,
    y: state.frog.position.y + platformDelta.y,
  }
  const slideCollision = resolvePlatformSideCollisions(
    state.frog.position,
    movedPosition,
    {
      x: hitWorldEdge ? 0 : state.frog.velocity.x,
      y: 0,
    },
    level,
    state.elapsedSeconds,
  )
  const nextSupportedPlatform = findSupportedPlatform(
    slideCollision.position,
    level,
    state.elapsedSeconds,
  )

  if (
    overlapsFinish(level.finish, slideCollision.position) ||
    crossesFinish(level.finish, state.frog.position, slideCollision.position)
  ) {
    return finishRunAtPosition(state, slideCollision.position)
  }

  if (!nextSupportedPlatform) {
    return {
      ...state,
      phase: 'airborne',
      frog: {
        position: slideCollision.position,
        velocity: {
          x: slideCollision.velocity.x,
          y: 0,
        },
      },
    }
  }

  return {
    ...state,
    frog: {
      position: slideCollision.position,
      velocity: {
        x:
          hitWorldEdge || !nextSupportedPlatform.slippery
            ? 0
            : applyHorizontalFriction(slideCollision.velocity.x, deltaSeconds),
        y: 0,
      },
    },
  }
}

export function createInitialFrogRunState(level: LevelData): FrogRunState {
  return {
    elapsedSeconds: 0,
    phase: 'charging',
    frog: {
      position: { x: level.spawn.x, y: level.spawn.y },
      velocity: { x: 0, y: 0 },
    },
    activeDirection: { x: 0, y: -1 },
    jumpDirection: { x: 0, y: -1 },
    jumpPower: minJumpPower,
    midAirJumpUsed: false,
    jumpCount: 0,
    finishedAtJumpCount: null,
    resetNotice: null,
  }
}

export function createInitialGameState(
  level: LevelData,
  mode: GameState['mode'] = 'coop',
): GameState {
  return {
    ...createInitialFrogRunState(level),
    mode,
    roles: {
      player1: 'direction',
      player2: 'power',
      player3: 'midJump',
    },
    players: {
      player1: { name: 'Player 1', color: 0x6de56d, connected: false },
      player2: { name: 'Player 2', color: 0x64b5ff, connected: false },
      player3: { name: 'Player 3', color: 0xffcf5a, connected: false },
      player4: { name: 'Player 4', color: 0xff8fb3, connected: false },
      player5: { name: 'Player 5', color: 0xc6a4ff, connected: false },
      player6: { name: 'Player 6', color: 0x6de5d2, connected: false },
      player7: { name: 'Player 7', color: 0xff9f5a, connected: false },
      player8: { name: 'Player 8', color: 0xd2f26d, connected: false },
    },
    pings: [],
    versus: mode === 'versus'
      ? {
          status: 'running',
          runs: {},
          winnerPlayerId: null,
          results: [],
        }
      : null,
  }
}

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

export function simulateFrogRunTick(
  state: FrogRunState,
  deltaSeconds: number,
  level: LevelData,
): FrogRunState {
  const stateWithNotice = {
    ...tickResetNotice(state, deltaSeconds),
    elapsedSeconds: state.elapsedSeconds + deltaSeconds,
  }

  if (state.phase === 'resetting') {
    return stateWithNotice.resetNotice
      ? stateWithNotice
      : {
          ...createInitialFrogRunState(level),
        }
  }

  if (overlapsTrap(stateWithNotice.frog.position, level, stateWithNotice.elapsedSeconds)) {
    return startTrapResetCountdown(stateWithNotice, stateWithNotice.frog.position)
  }

  if (isOutOfBounds(stateWithNotice.frog.position, level)) {
    return resetLevelAfterFailure(stateWithNotice, level, outOfBoundsMessage)
  }

  state = stateWithNotice

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

  if (
    overlapsTrap(nextPosition, level, state.elapsedSeconds) ||
    crossesTrap(state.frog.position, nextPosition, level, state.elapsedSeconds)
  ) {
    return startTrapResetCountdown(state, nextPosition)
  }

  if (isOutOfBounds(nextPosition, level)) {
    return resetLevelAfterFailure(state, level, outOfBoundsMessage)
  }

  const collision = resolvePlatformCollisions(
    state.frog.position,
    nextPosition,
    nextVelocityAfterWorldCollision,
    level,
    state.elapsedSeconds,
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
      ...finishRunAtPosition(state, landedPosition),
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
  }
}

export function simulateTick(
  state: GameState,
  deltaSeconds: number,
  level: LevelData,
): GameState {
  const nextRun = simulateFrogRunTick(state, deltaSeconds, level)
  const completedLanding =
    state.phase === 'airborne' &&
    nextRun.phase === 'charging' &&
    nextRun.jumpCount === state.jumpCount + 1

  return {
    ...state,
    ...nextRun,
    roles: completedLanding ? rotateRoles(state.roles) : state.roles,
  }
}

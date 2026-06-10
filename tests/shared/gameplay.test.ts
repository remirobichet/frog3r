import { describe, expect, it } from 'vitest'

import { minJumpPower } from '@shared/constants/game'
import { getDefaultLevel } from '@shared/levels'
import {
  createInitialGameState,
  launchJump,
  simulateTick,
  triggerMidAirJump,
  updateCharge,
  updateDirection,
} from '@shared/utils/gameplay'

describe('gameplay basics', () => {
  const level = getDefaultLevel()

  it('charges then launches frog in chosen direction', () => {
    let state = createInitialGameState(level)

    state = updateDirection(state, { x: 1, y: -1 })
    state = updateCharge(state, 0.5, true)
    state = launchJump(state)

    expect(state.phase).toBe('airborne')
    expect(state.frog.velocity.x).toBeGreaterThan(0)
    expect(state.frog.velocity.y).toBeLessThan(0)
    expect(state.jumpPower).toBeGreaterThan(minJumpPower)
  })

  it('allows only one mid-air mini jump per jump', () => {
    let state = createInitialGameState(level)
    state = launchJump(state)

    const firstMiniJump = triggerMidAirJump(state)
    const secondMiniJump = triggerMidAirJump(firstMiniJump)

    expect(firstMiniJump.midAirJumpUsed).toBe(true)
    expect(secondMiniJump.frog.velocity.x).toBe(firstMiniJump.frog.velocity.x)
    expect(secondMiniJump.frog.velocity.y).toBe(firstMiniJump.frog.velocity.y)
  })

  it('swaps player roles after landing', () => {
    let state = createInitialGameState(level)
    state = launchJump(state)

    for (let i = 0; i < 120; i += 1) {
      state = simulateTick(state, 1 / 60, level)
    }

    expect(state.phase).toBe('charging')
    expect(state.frog.position.y).toBe(level.spawn.y)
    expect(state.roles.player1).toBe('power')
    expect(state.roles.player2).toBe('midJump')
    expect(state.roles.player3).toBe('direction')
    expect(state.jumpCount).toBe(1)
  })

  it('finishes the run when landing inside the finish marker', () => {
    const finishLevel = {
      ...level,
      finish: {
        x: level.spawn.x + 10,
        y: level.spawn.y - 42,
        width: 40,
        height: 40,
        slippery: false,
        trampoline: false,
        trap: false,
      },
    }
    let state = createInitialGameState(finishLevel)
    state = launchJump(state)

    for (let i = 0; i < 120; i += 1) {
      state = simulateTick(state, 1 / 60, finishLevel)
    }

    expect(state.phase).toBe('finished')
    expect(state.jumpCount).toBe(1)
    expect(state.finishedAtJumpCount).toBe(1)
    expect(state.roles.player1).toBe('direction')
    expect(state.roles.player2).toBe('power')
    expect(state.roles.player3).toBe('midJump')
  })

  it('keeps the frog controllable while sliding on slippery platforms', () => {
    const slipperyLevel = {
      ...level,
      platforms: [
        {
          x: 0,
          y: level.spawn.y,
          width: 400,
          height: 40,
          slippery: true,
          trampoline: false,
          trap: false,
        },
      ],
      finish: {
        x: 1000,
        y: level.spawn.y,
        width: 40,
        height: 40,
        slippery: false,
        trampoline: false,
        trap: false,
      },
    }
    let state = createInitialGameState(slipperyLevel)

    state = updateDirection(state, { x: 1, y: -1 })
    state = launchJump(state)

    for (let i = 0; i < 120 && state.phase !== 'charging'; i += 1) {
      state = simulateTick(state, 1 / 60, slipperyLevel)
    }

    expect(state.phase).toBe('charging')
    expect(state.frog.velocity.x).toBeGreaterThan(0)

    const slidingX = state.frog.position.x
    state = updateDirection(state, { x: -1, y: -1 })
    state = updateCharge(state, 0.2, true)
    state = simulateTick(state, 1 / 60, slipperyLevel)

    expect(state.phase).toBe('charging')
    expect(state.frog.position.x).toBeGreaterThan(slidingX)
    expect(state.jumpPower).toBeGreaterThan(minJumpPower)
    expect(state.jumpDirection.x).toBeLessThan(0)
  })

  it('bounces the frog upward from trampoline platforms', () => {
    const trampolineLevel = {
      ...level,
      platforms: [
        {
          x: 0,
          y: level.spawn.y,
          width: 400,
          height: 40,
          slippery: false,
          trampoline: true,
          trap: false,
        },
      ],
      finish: {
        x: 1000,
        y: level.spawn.y,
        width: 40,
        height: 40,
        slippery: false,
        trampoline: false,
        trap: false,
      },
    }
    let state = createInitialGameState(trampolineLevel)

    state = updateDirection(state, { x: 1, y: -1 })
    state = launchJump(state)

    for (let i = 0; i < 120; i += 1) {
      state = simulateTick(state, 1 / 60, trampolineLevel)

      if (state.frog.velocity.y < -500 && state.frog.position.y === level.spawn.y) {
        break
      }
    }

    expect(state.phase).toBe('airborne')
    expect(state.frog.position.y).toBe(level.spawn.y)
    expect(state.frog.velocity.y).toBeLessThan(-500)
    expect(state.jumpCount).toBe(0)
  })

  it('carries the frog while standing on a moving platform', () => {
    const movingLevel = {
      ...level,
      spawn: { x: 80, y: level.spawn.y },
      platforms: [
        {
          x: 40,
          y: level.spawn.y,
          width: 120,
          height: 40,
          slippery: false,
          trampoline: false,
          trap: false,
          movement: {
            axis: 'x' as const,
            distance: 60,
            duration: 2,
            offset: 0,
          },
        },
      ],
      finish: {
        x: 1000,
        y: level.spawn.y,
        width: 40,
        height: 40,
        slippery: false,
        trampoline: false,
        trap: false,
      },
    }
    const state = simulateTick(createInitialGameState(movingLevel), 0.5, movingLevel)

    expect(state.phase).toBe('charging')
    expect(state.elapsedSeconds).toBe(0.5)
    expect(state.frog.position.x).toBe(110)
    expect(state.frog.position.y).toBe(level.spawn.y)
  })

  it('restarts the level with a temporary message when the frog falls out', () => {
    const state = simulateTick(
      {
        ...createInitialGameState(level),
        phase: 'airborne',
        frog: {
          position: { x: level.spawn.x, y: level.worldHeight + 80 },
          velocity: { x: 0, y: 300 },
        },
        jumpCount: 3,
      },
      1 / 60,
      level,
    )

    expect(state.phase).toBe('charging')
    expect(state.frog.position).toEqual(level.spawn)
    expect(state.frog.velocity).toEqual({ x: 0, y: 0 })
    expect(state.jumpCount).toBe(0)
    expect(state.resetNotice?.message).toContain('fell out')
    expect(state.resetNotice?.remainingSeconds).toBe(3)
  })

  it('shows the trap collision point before restarting the level', () => {
    const trapLevel = {
      ...level,
      platforms: [
        ...level.platforms,
        {
          x: level.spawn.x + 120,
          y: level.spawn.y - 30,
          width: 60,
          height: 60,
          slippery: false,
          trampoline: false,
          trap: true,
        },
      ],
    }
    const collisionPosition = { x: level.spawn.x + 130, y: level.spawn.y }
    let state = simulateTick(
      {
        ...createInitialGameState(trapLevel),
        frog: {
          position: collisionPosition,
          velocity: { x: 0, y: 0 },
        },
      },
      1 / 60,
      trapLevel,
    )

    expect(state.phase).toBe('resetting')
    expect(state.frog.position).toEqual(collisionPosition)
    expect(state.frog.velocity).toEqual({ x: 0, y: 0 })
    expect(state.resetNotice?.message).toContain('trap')
    expect(state.resetNotice?.remainingSeconds).toBe(3)

    for (let i = 0; i < 180; i += 1) {
      state = simulateTick(state, 1 / 60, trapLevel)
    }

    expect(state.phase).toBe('charging')
    expect(state.frog.position).toEqual(level.spawn)
    expect(state.resetNotice).toBeNull()
  })
})

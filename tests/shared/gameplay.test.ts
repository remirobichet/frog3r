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
        },
      ],
      finish: {
        x: 1000,
        y: level.spawn.y,
        width: 40,
        height: 40,
        slippery: false,
        trampoline: false,
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
        },
      ],
      finish: {
        x: 1000,
        y: level.spawn.y,
        width: 40,
        height: 40,
        slippery: false,
        trampoline: false,
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
})

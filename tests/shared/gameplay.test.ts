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
})

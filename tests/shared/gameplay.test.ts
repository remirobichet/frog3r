import { describe, expect, it } from 'vitest'

import { groundY, minJumpPower } from '@shared/constants/game'
import {
  createInitialGameState,
  launchJump,
  simulateTick,
  triggerMidAirJump,
  updateCharge,
  updateDirection,
} from '@shared/utils/gameplay'

describe('gameplay basics', () => {
  it('charges then launches frog in chosen direction', () => {
    let state = createInitialGameState()

    state = updateDirection(state, { x: 1, y: -1 })
    state = updateCharge(state, 0.5, true)
    state = launchJump(state)

    expect(state.phase).toBe('airborne')
    expect(state.frog.velocity.x).toBeGreaterThan(0)
    expect(state.frog.velocity.y).toBeLessThan(0)
    expect(state.jumpPower).toBeGreaterThan(minJumpPower)
  })

  it('allows only one mid-air mini jump per jump', () => {
    let state = createInitialGameState()
    state = launchJump(state)

    const firstMiniJump = triggerMidAirJump(state)
    const secondMiniJump = triggerMidAirJump(firstMiniJump)

    expect(firstMiniJump.midAirJumpUsed).toBe(true)
    expect(secondMiniJump.frog.velocity.x).toBe(firstMiniJump.frog.velocity.x)
    expect(secondMiniJump.frog.velocity.y).toBe(firstMiniJump.frog.velocity.y)
  })

  it('swaps player roles after landing', () => {
    let state = createInitialGameState()
    state = launchJump(state)

    for (let i = 0; i < 120; i += 1) {
      state = simulateTick(state, 1 / 60)
    }

    expect(state.phase).toBe('charging')
    expect(state.frog.position.y).toBe(groundY)
    expect(state.roles.player1).toBe('power')
    expect(state.roles.player2).toBe('direction')
    expect(state.jumpCount).toBe(1)
  })
})

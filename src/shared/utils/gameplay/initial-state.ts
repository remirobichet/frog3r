import { minJumpPower } from '@shared/constants/game'
import type { FrogRunState, GameState } from '@shared/types/game-state'
import type { LevelData } from '@shared/types/level'

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

import type {
  CoopPlayerId,
  GameMode,
  GameState,
  PlayerId,
  PlayerRole,
} from '../../shared/types/game-state'

export const coopPlayerOrder: CoopPlayerId[] = ['player1', 'player2', 'player3']
export const playerOrder: PlayerId[] = [
  'player1',
  'player2',
  'player3',
  'player4',
  'player5',
  'player6',
  'player7',
  'player8',
]

export const maxClientsByMode: Record<GameMode, number> = {
  coop: 3,
  versus: 8,
}

export function isCoopPlayerId(playerId: PlayerId): playerId is CoopPlayerId {
  return coopPlayerOrder.includes(playerId as CoopPlayerId)
}

export function findPlayerByRole(state: GameState, role: PlayerRole): CoopPlayerId {
  if (state.roles.player1 === role) {
    return 'player1'
  }

  if (state.roles.player2 === role) {
    return 'player2'
  }

  return 'player3'
}

export function getInputPlayerForRole(
  state: GameState,
  playerId: PlayerId,
  role: PlayerRole,
  allowDevelopmentInputs: boolean,
): CoopPlayerId | null {
  if (allowDevelopmentInputs) {
    return findPlayerByRole(state, role)
  }

  return isCoopPlayerId(playerId) ? playerId : null
}

export function getOpenPlayerSlot(
  sessionToPlayer: Map<string, PlayerId>,
  mode: GameMode,
): PlayerId | null {
  const assignedPlayers = new Set(sessionToPlayer.values())
  const availableSlots = mode === 'coop' ? coopPlayerOrder : playerOrder

  return availableSlots.find((playerId) => !assignedPlayers.has(playerId)) ?? null
}

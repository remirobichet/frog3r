import type { GameState, PlayerId, Vector2 } from '@shared/types/game-state'

export interface AimInputMessage {
  type: 'aim'
  direction: Vector2
}

export interface ChargeInputMessage {
  type: 'charge'
  active: boolean
}

export interface MiniJumpInputMessage {
  type: 'miniJump'
}

export type ClientInputMessage = AimInputMessage | ChargeInputMessage | MiniJumpInputMessage

export interface JoinedMessage {
  playerId: PlayerId
  inviteCode: string
}

export interface StateMessage {
  gameState: GameState
  connectedCount: number
  playerId: PlayerId | null
}

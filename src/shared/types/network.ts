import type { GameState, PlayerId, Vector2 } from '@shared/types/game-state'
import type { LevelSummary } from '@shared/types/level'

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

export interface SelectLevelInputMessage {
  type: 'selectLevel'
  levelId: string
}

export type ClientInputMessage =
  | AimInputMessage
  | ChargeInputMessage
  | MiniJumpInputMessage
  | SelectLevelInputMessage

export interface JoinedMessage {
  playerId: PlayerId
  inviteCode: string
}

export interface StateMessage {
  gameState: GameState
  connectedCount: number
  playerId: PlayerId | null
  levelId: string
  availableLevels: LevelSummary[]
  isCreator: boolean
  roundRevision: number
}

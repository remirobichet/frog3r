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

export interface SetNameInputMessage {
  type: 'setName'
  name: string
}

export interface PingInputMessage {
  type: 'ping'
  position: Vector2
}

export interface DebugTeleportInputMessage {
  type: 'debugTeleport'
  position: Vector2
}

export type ClientInputMessage =
  | AimInputMessage
  | ChargeInputMessage
  | MiniJumpInputMessage
  | SelectLevelInputMessage
  | SetNameInputMessage
  | PingInputMessage
  | DebugTeleportInputMessage

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

import { Room } from 'colyseus'
import type { Client } from 'colyseus'

import { fixedTimestepMs } from '@shared/constants/game'
import type { ClientInputMessage, JoinedMessage, StateMessage } from '@shared/types/network'
import type { GameState, PlayerId, Vector2 } from '@shared/types/game-state'
import {
  createInitialGameState,
  launchJump,
  simulateTick,
  triggerMidAirJump,
  updateCharge,
  updateDirection,
} from '@shared/utils/gameplay'

interface RoomOptions {
  inviteCode: string
}

const playerOrder: PlayerId[] = ['player1', 'player2']

function findPlayerByRole(state: GameState, role: 'direction' | 'power'): PlayerId {
  return state.roles.player1 === role ? 'player1' : 'player2'
}

export class GameRoom extends Room {
  public maxClients = 2

  private inviteCode = ''
  private gameState: GameState = createInitialGameState()
  private sessionToPlayer = new Map<string, PlayerId>()
  private directionIntent: Record<PlayerId, Vector2> = {
    player1: { x: 0, y: -1 },
    player2: { x: 0, y: -1 },
  }
  private chargingIntent: Record<PlayerId, boolean> = {
    player1: false,
    player2: false,
  }
  private miniJumpQueued: Record<PlayerId, boolean> = {
    player1: false,
    player2: false,
  }
  private wasCharging = false

  public onCreate(options: RoomOptions): void {
    this.inviteCode = options.inviteCode
    this.setMetadata({ inviteCode: this.inviteCode })

    this.onMessage('input', (client: Client, input: ClientInputMessage) => {
      const playerId = this.sessionToPlayer.get(client.sessionId)
      if (!playerId) {
        return
      }

      if (input.type === 'aim') {
        this.directionIntent[playerId] = input.direction
        return
      }

      if (input.type === 'charge') {
        this.chargingIntent[playerId] = input.active
        return
      }

      this.miniJumpQueued[playerId] = true
    })

    this.setSimulationInterval(() => {
      this.tick(fixedTimestepMs / 1000)
      this.broadcastState()
    }, fixedTimestepMs)
  }

  public onJoin(client: Client): void {
    const playerId = playerOrder[this.clients.length - 1]
    this.sessionToPlayer.set(client.sessionId, playerId)

    const joinedMessage: JoinedMessage = {
      playerId,
      inviteCode: this.inviteCode,
    }
    client.send('joined', joinedMessage)
    this.broadcastState()
  }

  public onLeave(client: Client): void {
    const playerId = this.sessionToPlayer.get(client.sessionId)
    if (!playerId) {
      return
    }

    this.sessionToPlayer.delete(client.sessionId)
    this.chargingIntent[playerId] = false
    this.miniJumpQueued[playerId] = false
    this.directionIntent[playerId] = { x: 0, y: -1 }
    this.broadcastState()
  }

  private tick(deltaSeconds: number): void {
    const directionPlayer = findPlayerByRole(this.gameState, 'direction')
    const powerPlayer = findPlayerByRole(this.gameState, 'power')
    const directionInput = this.directionIntent[directionPlayer]
    const isCharging = this.chargingIntent[powerPlayer]

    this.gameState = updateDirection(this.gameState, directionInput)
    this.gameState = updateCharge(this.gameState, deltaSeconds, isCharging)

    if (this.wasCharging && !isCharging && this.gameState.phase === 'charging') {
      this.gameState = launchJump(this.gameState)
    }
    this.wasCharging = isCharging

    if (this.miniJumpQueued[powerPlayer]) {
      this.gameState = triggerMidAirJump(this.gameState)
      this.miniJumpQueued[powerPlayer] = false
    }

    this.gameState = simulateTick(this.gameState, deltaSeconds)
  }

  private broadcastState(): void {
    const payload: StateMessage = {
      gameState: this.gameState,
      connectedCount: this.clients.length,
    }
    this.broadcast('state', payload)
  }
}

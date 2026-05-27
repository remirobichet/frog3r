import { Room } from 'colyseus'
import type { Client } from 'colyseus'

import { fixedTimestepMs } from '@shared/constants/game'
import { availableLevels, defaultLevelId, getLevelById } from '@shared/levels'
import type { ClientInputMessage, JoinedMessage, StateMessage } from '@shared/types/network'
import type { GameState, PlayerId, PlayerRole, Vector2 } from '@shared/types/game-state'
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

const playerOrder: PlayerId[] = ['player1', 'player2', 'player3']

function findPlayerByRole(state: GameState, role: PlayerRole): PlayerId {
  if (state.roles.player1 === role) {
    return 'player1'
  }

  if (state.roles.player2 === role) {
    return 'player2'
  }

  return 'player3'
}

export class GameRoom extends Room {
  public maxClients = 3

  private inviteCode = ''
  private currentLevelId = defaultLevelId
  private gameState: GameState = createInitialGameState(getLevelById(defaultLevelId))
  private sessionToPlayer = new Map<string, PlayerId>()
  private creatorSessionId: string | null = null
  private roundRevision = 0
  private directionIntent: Record<PlayerId, Vector2> = {
    player1: { x: 0, y: -1 },
    player2: { x: 0, y: -1 },
    player3: { x: 0, y: -1 },
  }
  private chargingIntent: Record<PlayerId, boolean> = {
    player1: false,
    player2: false,
    player3: false,
  }
  private miniJumpQueued: Record<PlayerId, boolean> = {
    player1: false,
    player2: false,
    player3: false,
  }
  private wasCharging = false

  public onCreate(options: RoomOptions): void {
    this.inviteCode = options.inviteCode
    this.setMetadata({ inviteCode: this.inviteCode })
    this.gameState = createInitialGameState(getLevelById(this.currentLevelId))

    this.onMessage('input', (client: Client, input: ClientInputMessage) => {
      const playerId = this.sessionToPlayer.get(client.sessionId)
      if (input.type === 'selectLevel') {
        if (client.sessionId !== this.creatorSessionId) {
          return
        }

        this.setLevel(input.levelId)
        this.broadcastState()
        return
      }

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
    if (!this.creatorSessionId) {
      this.creatorSessionId = client.sessionId
    }

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

    if (this.creatorSessionId === client.sessionId) {
      this.creatorSessionId = this.clients
        .find((connectedClient) => connectedClient.sessionId !== client.sessionId)?.sessionId ?? null
    }

    this.chargingIntent[playerId] = false
    this.miniJumpQueued[playerId] = false
    this.directionIntent[playerId] = { x: 0, y: -1 }
    this.broadcastState()
  }

  private tick(deltaSeconds: number): void {
    const level = getLevelById(this.currentLevelId)
    const directionPlayer = findPlayerByRole(this.gameState, 'direction')
    const powerPlayer = findPlayerByRole(this.gameState, 'power')
    const midJumpPlayer = findPlayerByRole(this.gameState, 'midJump')
    const directionInput = this.directionIntent[directionPlayer]
    const isCharging = this.chargingIntent[powerPlayer]

    this.gameState = updateDirection(this.gameState, directionInput)
    this.gameState = updateCharge(this.gameState, deltaSeconds, isCharging)

    if (this.wasCharging && !isCharging && this.gameState.phase === 'charging') {
      this.gameState = launchJump(this.gameState)
    }
    this.wasCharging = isCharging

    if (this.miniJumpQueued[midJumpPlayer]) {
      this.gameState = triggerMidAirJump(this.gameState)
      this.miniJumpQueued[midJumpPlayer] = false
    }

    this.gameState = simulateTick(this.gameState, deltaSeconds, level)
  }

  private setLevel(levelId: string): void {
    const nextLevel = getLevelById(levelId)
    if (nextLevel.id === this.currentLevelId) {
      return
    }

    this.currentLevelId = nextLevel.id
    this.roundRevision += 1
    this.gameState = createInitialGameState(nextLevel)
    this.directionIntent = {
      player1: { x: 0, y: -1 },
      player2: { x: 0, y: -1 },
      player3: { x: 0, y: -1 },
    }
    this.chargingIntent = {
      player1: false,
      player2: false,
      player3: false,
    }
    this.miniJumpQueued = {
      player1: false,
      player2: false,
      player3: false,
    }
    this.wasCharging = false
  }

  private broadcastState(): void {
    for (const client of this.clients) {
      const payload: StateMessage = {
        gameState: this.gameState,
        connectedCount: this.clients.length,
        playerId: this.sessionToPlayer.get(client.sessionId) ?? null,
        levelId: this.currentLevelId,
        availableLevels,
        isCreator: client.sessionId === this.creatorSessionId,
        roundRevision: this.roundRevision,
      }
      client.send('state', payload)
    }
  }
}

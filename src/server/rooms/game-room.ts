import { Room } from 'colyseus'
import type { Client } from 'colyseus'

import { fixedTimestepMs } from '../../shared/constants/game'
import { availableLevels, defaultLevelId, getLevelById } from '../../shared/levels'
import type { ClientInputMessage, JoinedMessage, StateMessage } from '../../shared/types/network'
import type { GameState, PlayerId, PlayerRole, Vector2 } from '../../shared/types/game-state'
import {
  createInitialGameState,
  debugTeleportFrog,
  launchJump,
  simulateTick,
  triggerMidAirJump,
  updateCharge,
  updateDirection,
} from '../../shared/utils/gameplay'

interface RoomOptions {
  inviteCode: string
}

const playerOrder: PlayerId[] = ['player1', 'player2', 'player3']
const pingLifetimeSeconds = 2
const maxPlayerNameLength = 18
const allowDevelopmentInputs = process.env.NODE_ENV !== 'production'

function findPlayerByRole(state: GameState, role: PlayerRole): PlayerId {
  if (state.roles.player1 === role) {
    return 'player1'
  }

  if (state.roles.player2 === role) {
    return 'player2'
  }

  return 'player3'
}

function getInputPlayerForRole(
  state: GameState,
  playerId: PlayerId,
  role: PlayerRole,
): PlayerId {
  if (allowDevelopmentInputs) {
    return findPlayerByRole(state, role)
  }

  return playerId
}

function sanitizePlayerName(name: string, playerId: PlayerId): string {
  const trimmedName = name.trim().replace(/\s+/g, ' ')
  if (!trimmedName) {
    const playerNumber = playerOrder.indexOf(playerId) + 1
    return `Player ${playerNumber}`
  }

  return trimmedName.slice(0, maxPlayerNameLength)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getOpenPlayerSlot(sessionToPlayer: Map<string, PlayerId>): PlayerId | null {
  const assignedPlayers = new Set(sessionToPlayer.values())
  return playerOrder.find((playerId) => !assignedPlayers.has(playerId)) ?? null
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
        const directionPlayer = getInputPlayerForRole(this.gameState, playerId, 'direction')
        this.directionIntent[directionPlayer] = input.direction
        return
      }

      if (input.type === 'charge') {
        const powerPlayer = getInputPlayerForRole(this.gameState, playerId, 'power')
        this.chargingIntent[powerPlayer] = input.active
        return
      }

      if (input.type === 'setName') {
        this.gameState = {
          ...this.gameState,
          players: {
            ...this.gameState.players,
            [playerId]: {
              ...this.gameState.players[playerId],
              name: sanitizePlayerName(input.name, playerId),
            },
          },
        }
        this.broadcastState()
        return
      }

      if (input.type === 'ping') {
        const level = getLevelById(this.currentLevelId)
        this.gameState = {
          ...this.gameState,
          pings: [
            ...this.gameState.pings,
            {
              playerId,
              position: {
                x: clamp(input.position.x, 0, level.worldWidth),
                y: clamp(input.position.y, 0, level.worldHeight),
              },
              createdAtSeconds: this.gameState.elapsedSeconds,
            },
          ],
        }
        this.broadcastState()
        return
      }

      if (input.type === 'debugTeleport') {
        if (!allowDevelopmentInputs) {
          return
        }

        const level = getLevelById(this.currentLevelId)
        this.gameState = debugTeleportFrog(this.gameState, input.position, level)
        this.resetInputState()
        this.broadcastState()
        return
      }

      const midJumpPlayer = getInputPlayerForRole(this.gameState, playerId, 'midJump')
      this.miniJumpQueued[midJumpPlayer] = true
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

    const playerId = getOpenPlayerSlot(this.sessionToPlayer)
    if (!playerId) {
      void client.leave()
      return
    }

    this.sessionToPlayer.set(client.sessionId, playerId)
    this.gameState = this.setPlayerConnected(this.gameState, playerId, true)

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
    this.gameState = this.setPlayerConnected(this.gameState, playerId, false)

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

    if (this.gameState.phase === 'resetting') {
      this.gameState = this.expirePings(
        simulateTick(this.gameState, deltaSeconds, level),
      )
      if (this.gameState.phase === 'charging') {
        this.resetInputState()
      }
      return
    }

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

    const phaseBeforeSimulation = this.gameState.phase
    this.gameState = this.expirePings(
      simulateTick(this.gameState, deltaSeconds, level),
    )
    if (
      this.gameState.phase === 'resetting'
      || (
        phaseBeforeSimulation !== 'charging'
        && this.gameState.phase === 'charging'
        && this.gameState.resetNotice !== null
      )
    ) {
      this.resetInputState()
    }
  }

  private setLevel(levelId: string): void {
    const nextLevel = getLevelById(levelId)
    if (nextLevel.id === this.currentLevelId) {
      return
    }

    this.currentLevelId = nextLevel.id
    this.roundRevision += 1
    this.gameState = {
      ...createInitialGameState(nextLevel),
      players: this.gameState.players,
    }
    this.resetInputState()
  }

  private setPlayerConnected(
    state: GameState,
    playerId: PlayerId,
    connected: boolean,
  ): GameState {
    return {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          connected,
        },
      },
    }
  }

  private expirePings(state: GameState): GameState {
    const activePings = state.pings.filter(
      (ping) => state.elapsedSeconds - ping.createdAtSeconds < pingLifetimeSeconds,
    )
    if (activePings.length === state.pings.length) {
      return state
    }

    return {
      ...state,
      pings: activePings,
    }
  }

  private resetInputState(): void {
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

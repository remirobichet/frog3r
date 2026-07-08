import { Room } from 'colyseus'
import type { Client } from 'colyseus'

import { fixedTimestepMs } from '../../shared/constants/game'
import { availableLevels, defaultLevelId, getLevelById } from '../../shared/levels'
import type { JoinedMessage, StateMessage } from '../../shared/types/network'
import type {
  GameMode,
  GameState,
  PlayerId,
  Vector2,
  VersusBestGhost,
  VersusGhostSample,
  VersusPlayerRun,
  VersusState,
} from '../../shared/types/game-state'
import {
  createInitialFrogRunState,
  createInitialGameState,
  debugTeleportFrog,
  launchJump,
  simulateFrogRunTick,
  simulateTick,
  triggerMidAirJump,
  updateCharge,
  updateDirection,
} from '../../shared/utils/gameplay'
import type { LevelData } from '../../shared/types/level'

import { routeClientInput } from './input-routing'
import {
  findPlayerByRole,
  getInputPlayerForRole,
  getOpenPlayerSlot,
  maxClientsByMode,
  playerOrder,
} from './player-slots'

interface RoomOptions {
  inviteCode: string
  mode?: GameMode
}

const pingLifetimeSeconds = 2
const maxPlayerNameLength = 18
const allowDevelopmentInputs = process.env.NODE_ENV !== 'production'
const versusCountdownSeconds = 3
const ghostSampleIntervalSeconds = 0.1

function createDirectionIntent(): Record<PlayerId, Vector2> {
  return {
    player1: { x: 0, y: -1 },
    player2: { x: 0, y: -1 },
    player3: { x: 0, y: -1 },
    player4: { x: 0, y: -1 },
    player5: { x: 0, y: -1 },
    player6: { x: 0, y: -1 },
    player7: { x: 0, y: -1 },
    player8: { x: 0, y: -1 },
  }
}

function createBooleanIntent(value: boolean): Record<PlayerId, boolean> {
  return {
    player1: value,
    player2: value,
    player3: value,
    player4: value,
    player5: value,
    player6: value,
    player7: value,
    player8: value,
  }
}

function createVersusState(bestGhost: VersusBestGhost | null = null): VersusState {
  return {
    status: 'waiting',
    raceElapsedSeconds: 0,
    countdownRemainingSeconds: 0,
    ready: {},
    runs: {},
    winnerPlayerId: null,
    results: [],
    bestGhost,
  }
}

function createVersusPlayerRun(
  level: LevelData,
  elapsedSeconds = 0,
): VersusPlayerRun {
  return {
    run: {
      ...createInitialFrogRunState(level),
      elapsedSeconds,
    },
    finishedAtSeconds: null,
    finishRank: null,
  }
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

export class GameRoom extends Room {
  public maxClients = maxClientsByMode.coop

  private inviteCode = ''
  private mode: GameMode = 'coop'
  private currentLevelId = defaultLevelId
  private gameState: GameState = createInitialGameState(getLevelById(defaultLevelId))
  private sessionToPlayer = new Map<string, PlayerId>()
  private creatorSessionId: string | null = null
  private roundRevision = 0
  private directionIntent: Record<PlayerId, Vector2> = createDirectionIntent()
  private chargingIntent: Record<PlayerId, boolean> = createBooleanIntent(false)
  private miniJumpQueued: Record<PlayerId, boolean> = createBooleanIntent(false)
  private wasCharging: Record<PlayerId, boolean> = createBooleanIntent(false)
  private bestGhostByLevel = new Map<string, VersusBestGhost>()
  private currentGhostSamples: Partial<Record<PlayerId, VersusGhostSample[]>> = {}
  private lastGhostSampleAt: Partial<Record<PlayerId, number>> = {}

  public onCreate(options: RoomOptions): void {
    this.inviteCode = options.inviteCode
    this.mode = options.mode === 'versus' ? 'versus' : 'coop'
    this.maxClients = maxClientsByMode[this.mode]
    this.setMetadata({
      inviteCode: this.inviteCode,
      mode: this.mode,
      maxClients: this.maxClients,
    })
    this.gameState = createInitialGameState(getLevelById(this.currentLevelId), this.mode)

    this.onMessage('input', (client: Client, input) => {
      const playerId = this.sessionToPlayer.get(client.sessionId)
      const shouldBroadcast = routeClientInput({
        clientSessionId: client.sessionId,
        playerId,
        creatorSessionId: this.creatorSessionId,
        input,
        allowDevelopmentInputs,
        handlers: {
          selectLevel: (levelId) => this.setLevel(levelId),
          aim: (inputPlayerId, direction) => this.handleAimInput(inputPlayerId, direction),
          charge: (inputPlayerId, active) => this.handleChargeInput(inputPlayerId, active),
          setName: (inputPlayerId, name) => this.handleSetNameInput(inputPlayerId, name),
          ping: (inputPlayerId, position) => this.handlePingInput(inputPlayerId, position),
          debugTeleport: (inputPlayerId, position) => this.handleDebugTeleport(inputPlayerId, position),
          miniJump: (inputPlayerId) => this.handleMiniJumpInput(inputPlayerId),
          setReady: (inputPlayerId, ready) => this.handleSetReadyInput(inputPlayerId, ready),
          restartRace: () => this.restartVersusRace(),
        },
      })

      if (shouldBroadcast) {
        this.broadcastState()
      }
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

    const playerId = getOpenPlayerSlot(this.sessionToPlayer, this.mode)
    if (!playerId) {
      void client.leave()
      return
    }

    this.sessionToPlayer.set(client.sessionId, playerId)
    this.gameState = this.setPlayerConnected(this.gameState, playerId, true)
    if (this.mode === 'versus') {
      if (this.gameState.versus?.status === 'running') {
        this.setVersusPlayerReady(playerId, false)
        this.resetPlayerInputState(playerId)
      } else {
        this.resetVersusRun(playerId)
      }
      this.resetVersusCountdownIfActive()
    }

    const joinedMessage: JoinedMessage = {
      playerId,
      inviteCode: this.inviteCode,
      mode: this.mode,
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

    this.resetPlayerInputState(playerId)
    this.resetVersusCountdownIfActive()
    this.finishVersusIfAllConnectedPlayersAreDone()
    this.broadcastState()
  }

  private handleAimInput(playerId: PlayerId, direction: Vector2): void {
    if (this.mode === 'versus') {
      if (this.gameState.versus?.status !== 'running') {
        return
      }

      this.directionIntent[playerId] = direction
      return
    }

    const directionPlayer = getInputPlayerForRole(
      this.gameState,
      playerId,
      'direction',
      allowDevelopmentInputs,
    )
    if (directionPlayer) {
      this.directionIntent[directionPlayer] = direction
    }
  }

  private handleChargeInput(playerId: PlayerId, active: boolean): void {
    if (this.mode === 'versus') {
      if (this.gameState.versus?.status !== 'running') {
        return
      }

      this.chargingIntent[playerId] = active
      return
    }

    const powerPlayer = getInputPlayerForRole(
      this.gameState,
      playerId,
      'power',
      allowDevelopmentInputs,
    )
    if (powerPlayer) {
      this.chargingIntent[powerPlayer] = active
    }
  }

  private handleMiniJumpInput(playerId: PlayerId): void {
    if (this.mode === 'versus') {
      if (this.gameState.versus?.status !== 'running') {
        return
      }

      this.miniJumpQueued[playerId] = true
      return
    }

    const midJumpPlayer = getInputPlayerForRole(
      this.gameState,
      playerId,
      'midJump',
      allowDevelopmentInputs,
    )
    if (midJumpPlayer) {
      this.miniJumpQueued[midJumpPlayer] = true
    }
  }

  private setVersusPlayerReady(playerId: PlayerId, ready: boolean): void {
    const versus = this.gameState.versus ?? createVersusState(
      this.bestGhostByLevel.get(this.currentLevelId) ?? null,
    )
    this.gameState = {
      ...this.gameState,
      versus: {
        ...versus,
        ready: {
          ...versus.ready,
          [playerId]: ready,
        },
      },
    }
  }

  private handleSetReadyInput(playerId: PlayerId, ready: boolean): void {
    if (this.mode !== 'versus') {
      return
    }

    const versus = this.gameState.versus ?? createVersusState(
      this.bestGhostByLevel.get(this.currentLevelId) ?? null,
    )
    if (versus.status === 'running') {
      return
    }

    this.gameState = {
      ...this.gameState,
      versus: {
        ...versus,
        status: versus.status === 'finished' ? 'waiting' : versus.status,
        countdownRemainingSeconds:
          versus.status === 'finished' ? 0 : versus.countdownRemainingSeconds,
        ready: {
          ...versus.ready,
          [playerId]: ready,
        },
      },
    }
    this.tryStartVersusCountdown()
  }

  private handleSetNameInput(playerId: PlayerId, name: string): void {
    this.gameState = {
      ...this.gameState,
      players: {
        ...this.gameState.players,
        [playerId]: {
          ...this.gameState.players[playerId],
          name: sanitizePlayerName(name, playerId),
        },
      },
    }
  }

  private handlePingInput(playerId: PlayerId, position: Vector2): void {
    const level = getLevelById(this.currentLevelId)
    this.gameState = {
      ...this.gameState,
      pings: [
        ...this.gameState.pings,
        {
          playerId,
          position: {
            x: clamp(position.x, 0, level.worldWidth),
            y: clamp(position.y, 0, level.worldHeight),
          },
          createdAtSeconds: this.gameState.elapsedSeconds,
        },
      ],
    }
  }

  private handleDebugTeleport(playerId: PlayerId, position: Vector2): void {
    const level = getLevelById(this.currentLevelId)
    if (this.mode === 'versus') {
      const versus = this.gameState.versus ?? createVersusState(
        this.bestGhostByLevel.get(this.currentLevelId) ?? null,
      )
      const playerRun = versus.runs[playerId] ?? createVersusPlayerRun(
        level,
        versus.raceElapsedSeconds,
      )
      this.gameState = {
        ...this.gameState,
        versus: {
          ...versus,
          runs: {
            ...versus.runs,
            [playerId]: {
              ...playerRun,
              run: debugTeleportFrog(playerRun.run, position, level),
            },
          },
        },
      }
      this.resetPlayerInputState(playerId)
      return
    }

    this.gameState = debugTeleportFrog(this.gameState, position, level)
    this.resetInputState()
  }

  private tick(deltaSeconds: number): void {
    if (this.mode === 'versus') {
      this.tickVersus(deltaSeconds)
      return
    }

    this.tickCoop(deltaSeconds)
  }

  private tickCoop(deltaSeconds: number): void {
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

    if (
      this.wasCharging[powerPlayer] &&
      !isCharging &&
      this.gameState.phase === 'charging'
    ) {
      this.gameState = launchJump(this.gameState)
    }
    this.wasCharging[powerPlayer] = isCharging

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

  private tickVersus(deltaSeconds: number): void {
    const level = getLevelById(this.currentLevelId)
    const nextElapsedSeconds = this.gameState.elapsedSeconds + deltaSeconds
    const versus = this.gameState.versus ?? createVersusState(
      this.bestGhostByLevel.get(this.currentLevelId) ?? null,
    )

    if (versus.status === 'waiting') {
      this.gameState = this.expirePings({
        ...this.gameState,
        elapsedSeconds: nextElapsedSeconds,
        versus,
      })
      return
    }

    if (versus.status === 'countdown') {
      const countdownRemainingSeconds = Math.max(
        0,
        versus.countdownRemainingSeconds - deltaSeconds,
      )
      this.gameState = this.expirePings({
        ...this.gameState,
        elapsedSeconds: nextElapsedSeconds,
        versus: {
          ...versus,
          countdownRemainingSeconds,
        },
      })

      if (countdownRemainingSeconds <= 0) {
        this.startVersusRace()
      }

      return
    }

    if (versus.status === 'finished') {
      this.gameState = this.expirePings({
        ...this.gameState,
        elapsedSeconds: nextElapsedSeconds,
        versus,
      })
      return
    }

    const nextRaceElapsedSeconds = versus.raceElapsedSeconds + deltaSeconds
    const runs = { ...versus.runs }
    let results = versus.results
    let winnerPlayerId = versus.winnerPlayerId

    for (const playerId of playerOrder) {
      if (!this.gameState.players[playerId].connected) {
        continue
      }

      const currentPlayerRun = runs[playerId] ?? createVersusPlayerRun(
        level,
        versus.raceElapsedSeconds,
      )
      if (currentPlayerRun.finishedAtSeconds !== null) {
        runs[playerId] = currentPlayerRun
        continue
      }

      let run = {
        ...currentPlayerRun.run,
        elapsedSeconds: versus.raceElapsedSeconds,
      }
      const directionInput = this.directionIntent[playerId]
      const isCharging = this.chargingIntent[playerId]
      const phaseBeforeSimulation = run.phase

      run = updateDirection(run, directionInput)
      run = updateCharge(run, deltaSeconds, isCharging)

      if (this.wasCharging[playerId] && !isCharging && run.phase === 'charging') {
        run = launchJump(run)
      }
      this.wasCharging[playerId] = isCharging

      if (this.miniJumpQueued[playerId]) {
        run = triggerMidAirJump(run)
        this.miniJumpQueued[playerId] = false
      }

      run = {
        ...simulateFrogRunTick(run, deltaSeconds, level),
        elapsedSeconds: nextRaceElapsedSeconds,
      }
      this.recordGhostSample(playerId, run)
      if (
        run.phase === 'resetting'
        || (
          phaseBeforeSimulation !== 'charging'
          && run.phase === 'charging'
          && run.resetNotice !== null
        )
      ) {
        this.resetPlayerInputState(playerId)
      }

      if (run.phase === 'finished') {
        const rank = results.length + 1
        const finishedAtSeconds = nextRaceElapsedSeconds
        results = [
          ...results,
          {
            playerId,
            name: this.gameState.players[playerId].name,
            finishedAtSeconds,
            jumpCount: run.finishedAtJumpCount ?? run.jumpCount,
            rank,
          },
        ]
        winnerPlayerId = winnerPlayerId ?? playerId
        this.updateBestGhost(playerId, finishedAtSeconds, run)
        this.resetPlayerInputState(playerId)
        runs[playerId] = {
          run,
          finishedAtSeconds,
          finishRank: rank,
        }
      } else {
        runs[playerId] = {
          ...currentPlayerRun,
          run,
        }
      }
    }

    this.gameState = this.expirePings({
      ...this.gameState,
      elapsedSeconds: nextElapsedSeconds,
      versus: {
        status: 'running',
        raceElapsedSeconds: nextRaceElapsedSeconds,
        countdownRemainingSeconds: 0,
        ready: versus.ready,
        runs,
        winnerPlayerId,
        results,
        bestGhost: this.bestGhostByLevel.get(this.currentLevelId) ?? null,
      },
    })
    this.finishVersusIfAllConnectedPlayersAreDone()
  }

  private setLevel(levelId: string): void {
    const nextLevel = getLevelById(levelId)
    if (nextLevel.id === this.currentLevelId) {
      return
    }

    this.currentLevelId = nextLevel.id
    this.roundRevision += 1
    this.currentGhostSamples = {}
    this.lastGhostSampleAt = {}
    this.gameState = this.createFreshGameState(nextLevel)
    this.resetInputState()
  }

  private createFreshGameState(level: LevelData): GameState {
    const nextState = {
      ...createInitialGameState(level, this.mode),
      players: this.gameState.players,
    }
    if (this.mode !== 'versus') {
      return nextState
    }

    const runs: VersusState['runs'] = {}
    for (const playerId of playerOrder) {
      if (nextState.players[playerId].connected) {
        runs[playerId] = createVersusPlayerRun(level, nextState.elapsedSeconds)
      }
    }

    return {
      ...nextState,
      versus: {
        status: 'waiting',
        raceElapsedSeconds: 0,
        countdownRemainingSeconds: 0,
        ready: {},
        runs,
        winnerPlayerId: null,
        results: [],
        bestGhost: this.bestGhostByLevel.get(level.id) ?? null,
      },
    }
  }

  private getConnectedPlayerIds(): PlayerId[] {
    return playerOrder.filter((playerId) => this.gameState.players[playerId].connected)
  }

  private resetVersusCountdownIfActive(): void {
    if (this.mode !== 'versus' || this.gameState.versus?.status !== 'countdown') {
      return
    }

    this.gameState = {
      ...this.gameState,
      versus: {
        ...this.gameState.versus,
        status: 'waiting',
        countdownRemainingSeconds: 0,
        ready: {},
      },
    }
  }

  private tryStartVersusCountdown(): void {
    if (this.mode !== 'versus' || !this.gameState.versus) {
      return
    }

    if (this.gameState.versus.status !== 'waiting') {
      return
    }

    const activePlayerIds = this.getConnectedPlayerIds()
    if (activePlayerIds.length < 1) {
      return
    }

    const everyActivePlayerReady = activePlayerIds.every(
      (playerId) => this.gameState.versus?.ready[playerId] === true,
    )
    if (!everyActivePlayerReady) {
      return
    }

    this.gameState = {
      ...this.gameState,
      versus: {
        ...this.gameState.versus,
        status: 'countdown',
        countdownRemainingSeconds: versusCountdownSeconds,
      },
    }
  }

  private createVersusRunsForConnectedPlayers(
    level: LevelData,
  ): VersusState['runs'] {
    const runs: VersusState['runs'] = {}
    for (const playerId of this.getConnectedPlayerIds()) {
      runs[playerId] = createVersusPlayerRun(level, 0)
    }

    return runs
  }

  private startVersusRace(): void {
    if (this.mode !== 'versus' || !this.gameState.versus) {
      return
    }

    const level = getLevelById(this.currentLevelId)
    this.currentGhostSamples = {}
    this.lastGhostSampleAt = {}
    this.resetInputState()

    this.gameState = {
      ...this.gameState,
      versus: {
        ...this.gameState.versus,
        status: 'running',
        raceElapsedSeconds: 0,
        countdownRemainingSeconds: 0,
        runs: this.createVersusRunsForConnectedPlayers(level),
        winnerPlayerId: null,
        results: [],
        bestGhost: this.bestGhostByLevel.get(this.currentLevelId) ?? null,
      },
    }
  }

  private restartVersusRace(): void {
    if (this.mode !== 'versus' || !this.gameState.versus) {
      return
    }

    const level = getLevelById(this.currentLevelId)
    this.currentGhostSamples = {}
    this.lastGhostSampleAt = {}
    this.resetInputState()

    this.gameState = {
      ...this.gameState,
      versus: {
        ...this.gameState.versus,
        status: 'waiting',
        raceElapsedSeconds: 0,
        countdownRemainingSeconds: 0,
        ready: {},
        runs: this.createVersusRunsForConnectedPlayers(level),
        winnerPlayerId: null,
        results: [],
        bestGhost: this.bestGhostByLevel.get(this.currentLevelId) ?? null,
      },
    }
  }

  private createGhostSample(run: VersusPlayerRun['run']): VersusGhostSample {
    return {
      elapsedSeconds: run.elapsedSeconds,
      phase: run.phase,
      frog: {
        position: { ...run.frog.position },
        velocity: { ...run.frog.velocity },
      },
      jumpDirection: { ...run.jumpDirection },
    }
  }

  private recordGhostSample(playerId: PlayerId, run: VersusPlayerRun['run']): void {
    const lastSampleAt = this.lastGhostSampleAt[playerId]
    if (
      lastSampleAt !== undefined
      && run.elapsedSeconds - lastSampleAt < ghostSampleIntervalSeconds
      && run.phase !== 'finished'
    ) {
      return
    }

    const samples = this.currentGhostSamples[playerId] ?? []
    samples.push(this.createGhostSample(run))
    this.currentGhostSamples[playerId] = samples
    this.lastGhostSampleAt[playerId] = run.elapsedSeconds
  }

  private updateBestGhost(
    playerId: PlayerId,
    finishedAtSeconds: number,
    run: VersusPlayerRun['run'],
  ): void {
    this.recordGhostSample(playerId, run)
    const currentBestGhost = this.bestGhostByLevel.get(this.currentLevelId)
    if (currentBestGhost && currentBestGhost.finishedAtSeconds <= finishedAtSeconds) {
      return
    }

    const bestGhost: VersusBestGhost = {
      playerId,
      name: this.gameState.players[playerId].name,
      finishedAtSeconds,
      jumpCount: run.finishedAtJumpCount ?? run.jumpCount,
      samples: this.currentGhostSamples[playerId] ?? [this.createGhostSample(run)],
    }
    this.bestGhostByLevel.set(this.currentLevelId, bestGhost)
  }

  private resetVersusRun(playerId: PlayerId): void {
    const level = getLevelById(this.currentLevelId)
    const versus = this.gameState.versus ?? createVersusState(
      this.bestGhostByLevel.get(this.currentLevelId) ?? null,
    )
    this.gameState = {
      ...this.gameState,
      versus: {
        ...versus,
        ready: {
          ...versus.ready,
          [playerId]: false,
        },
        runs: {
          ...versus.runs,
          [playerId]: createVersusPlayerRun(level, 0),
        },
      },
    }
    this.resetPlayerInputState(playerId)
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

  private finishVersusIfAllConnectedPlayersAreDone(): void {
    if (this.mode !== 'versus' || !this.gameState.versus) {
      return
    }

    if (this.gameState.versus.status !== 'running') {
      return
    }

    const activePlayerIds = playerOrder.filter((playerId) => (
      this.gameState.players[playerId].connected
      && this.gameState.versus?.runs[playerId] !== undefined
    ))
    if (activePlayerIds.length === 0) {
      return
    }

    const everyActivePlayerFinished = activePlayerIds.every((playerId) => {
      const playerRun = this.gameState.versus?.runs[playerId]
      return playerRun !== undefined && playerRun.finishedAtSeconds !== null
    })

    if (!everyActivePlayerFinished) {
      return
    }

    this.gameState = {
      ...this.gameState,
      versus: {
        ...this.gameState.versus,
        status: 'finished',
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
    this.directionIntent = createDirectionIntent()
    this.chargingIntent = createBooleanIntent(false)
    this.miniJumpQueued = createBooleanIntent(false)
    this.wasCharging = createBooleanIntent(false)
  }

  private resetPlayerInputState(playerId: PlayerId): void {
    this.directionIntent[playerId] = { x: 0, y: -1 }
    this.chargingIntent[playerId] = false
    this.miniJumpQueued[playerId] = false
    this.wasCharging[playerId] = false
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
        mode: this.mode,
        maxClients: this.maxClients,
      }
      client.send('state', payload)
    }
  }
}

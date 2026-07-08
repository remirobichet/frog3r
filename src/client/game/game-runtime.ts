import type { Room } from 'colyseus.js'
import type { Texture } from 'pixi.js'
import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
} from 'pixi.js'

import frogSpritesheetUrl from '@client/assets/frog/frog.png'
import type { FrogAnimation, FrogView, FrogViewKey } from '@client/game/frog-renderer'
import {
  FROG_IDLE_ANIMATION_SPEED,
  FROG_RENDER_SIZE,
  FROG_VISUAL_Y_OFFSET,
  createFrogTextures,
  getFrogAnimation,
  renderVersusFrogs,
  setFrogAnimation,
  setFrogFacing,
} from '@client/game/frog-renderer'
import type { PlayerControlRole } from '@client/game/hud'
import {
  colorToCss,
  getCenterNoticeMessage,
  getGameStatusPanel,
  getPlayerLabel,
  getPlayerRoleBanner,
  getPlayerRolesSummary,
  getResetNoticeBanner,
  getRoleDisplayName,
  getRoleHint,
  getRoomControls,
  getVersusControls,
  getVersusPlayersSummary,
  syncLevelOptions,
} from '@client/game/hud'
import {
  getDirectionalVector,
  setupKeyboard,
  setupMouse,
} from '@client/game/input'
import type { LoadedTileset } from '@client/game/level-renderer'
import {
  drawLevel,
  drawPings,
  loadTilesets,
} from '@client/game/level-renderer'
import {
  frogRadius,
  maxJumpPower,
  minJumpPower,
  worldHeight,
  worldWidth,
} from '@shared/constants/game'
import { availableLevels, getDefaultLevel, getLevelById } from '@shared/levels'
import type {
  CoopPlayerId,
  GameState,
  PlayerId,
  PlayerRole,
  Vector2,
} from '@shared/types/game-state'
import type {
  ClientInputMessage,
  JoinedMessage,
  StateMessage,
} from '@shared/types/network'

interface StartGameRuntimeParams {
  root: HTMLElement
  room: Room
  inviteCode: string
  onDisconnect: () => void
}

export interface GameRuntime {
  destroy: () => void
  getInviteCode: () => string
}

const AIM_ARROW_LENGTH = 92
const AIM_ARROW_HEAD_LENGTH = 28
const AIM_ARROW_HALF_HEIGHT = 16
const AIM_ARROW_TAIL_WIDTH = 8
const POWER_INDICATOR_WIDTH = 76
const POWER_INDICATOR_HEIGHT = 10
const POWER_INDICATOR_DISTANCE = 78
const POWER_INDICATOR_HIGH_POWER_THRESHOLD = 0.72

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`
}

function getVersusControlStatus(state: GameState, playerId: PlayerId | null): string {
  const versus = state.versus
  if (!versus) {
    return 'Waiting for racers.'
  }

  const ghostLine = versus.bestGhost
    ? `Best ghost: ${versus.bestGhost.name} ${formatSeconds(versus.bestGhost.finishedAtSeconds)}`
    : 'Best ghost: none yet'

  if (versus.status === 'waiting') {
    const connectedPlayerIds = Object.entries(state.players)
      .filter(([, player]) => player.connected)
      .map(([connectedPlayerId]) => connectedPlayerId as PlayerId)
    const readyCount = connectedPlayerIds.filter(
      (connectedPlayerId) => versus.ready[connectedPlayerId],
    ).length
    return `Waiting: ${readyCount}/${connectedPlayerIds.length} ready. ${ghostLine}`
  }

  if (versus.status === 'countdown') {
    return `Starting in ${Math.ceil(versus.countdownRemainingSeconds)}. ${ghostLine}`
  }

  if (versus.status === 'finished') {
    return `Race finished. ${ghostLine}`
  }

  const myRun = playerId ? versus.runs[playerId] : null
  if (playerId && !myRun) {
    return `Joined mid-race. Waiting for restart. ${ghostLine}`
  }

  if (myRun?.finishedAtSeconds !== null && myRun?.finishedAtSeconds !== undefined) {
    return `You finished in ${formatSeconds(myRun.finishedAtSeconds)}. ${ghostLine}`
  }

  return `Race time ${formatSeconds(versus.raceElapsedSeconds)}. ${ghostLine}`
}

function getLevelRenderElapsedSeconds(state: GameState): number {
  return state.mode === 'versus'
    ? (state.versus?.raceElapsedSeconds ?? 0)
    : state.elapsedSeconds
}

function getFrogRenderPosition(frogPosition: Vector2): Vector2 {
  return {
    x: frogPosition.x,
    y: frogPosition.y - frogRadius,
  }
}

function drawPowerIndicator(
  powerIndicator: Graphics,
  frogRenderPosition: Vector2,
  jumpDirection: Vector2,
  powerRatio: number,
): void {
  const clampedPowerRatio = Math.max(0, Math.min(1, powerRatio))
  const directionLength = Math.hypot(jumpDirection.x, jumpDirection.y) || 1
  const offsetX =
    -(jumpDirection.x / directionLength) * POWER_INDICATOR_DISTANCE
  const offsetY =
    -(jumpDirection.y / directionLength) * POWER_INDICATOR_DISTANCE
  const x = frogRenderPosition.x + offsetX - POWER_INDICATOR_WIDTH / 2
  const y = frogRenderPosition.y + offsetY - POWER_INDICATOR_HEIGHT / 2
  const color =
    clampedPowerRatio >= POWER_INDICATOR_HIGH_POWER_THRESHOLD
      ? 0xf8d45c
      : 0x7bdc67

  powerIndicator.clear()
  powerIndicator.roundRect(
    x - 2,
    y - 2,
    POWER_INDICATOR_WIDTH + 4,
    POWER_INDICATOR_HEIGHT + 4,
    POWER_INDICATOR_HEIGHT,
  )
  powerIndicator.fill({ color: 0x06100c, alpha: 0.78 })
  powerIndicator.roundRect(
    x,
    y,
    POWER_INDICATOR_WIDTH,
    POWER_INDICATOR_HEIGHT,
    POWER_INDICATOR_HEIGHT / 2,
  )
  powerIndicator.fill({ color: 0xd9ffe0, alpha: 0.55 })
  powerIndicator.roundRect(
    x,
    y,
    POWER_INDICATOR_WIDTH * clampedPowerRatio,
    POWER_INDICATOR_HEIGHT,
    POWER_INDICATOR_HEIGHT / 2,
  )
  powerIndicator.fill({ color, alpha: 0.92 })
}

function drawAimArrow(aim: Graphics): void {
  aim.clear()
  aim.moveTo(0, -AIM_ARROW_TAIL_WIDTH / 2)
  aim.lineTo(
    AIM_ARROW_LENGTH - AIM_ARROW_HEAD_LENGTH,
    -AIM_ARROW_TAIL_WIDTH / 2,
  )
  aim.lineTo(AIM_ARROW_LENGTH - AIM_ARROW_HEAD_LENGTH, -AIM_ARROW_HALF_HEIGHT)
  aim.lineTo(AIM_ARROW_LENGTH, 0)
  aim.lineTo(AIM_ARROW_LENGTH - AIM_ARROW_HEAD_LENGTH, AIM_ARROW_HALF_HEIGHT)
  aim.lineTo(AIM_ARROW_LENGTH - AIM_ARROW_HEAD_LENGTH, AIM_ARROW_TAIL_WIDTH / 2)
  aim.lineTo(0, AIM_ARROW_TAIL_WIDTH / 2)
  aim.closePath()
  aim.fill({ color: 0xe4f8c2, alpha: 0.9 })
  aim.stroke({ color: 0x1b3f25, width: 4, alpha: 0.86 })
}

export async function startGameRuntime(
  params: StartGameRuntimeParams,
): Promise<GameRuntime> {
  const defaultLevel = getDefaultLevel()
  const defaultTilesets = await loadTilesets(defaultLevel)
  const frogTexture = await Assets.load<Texture>(frogSpritesheetUrl)
  const app = new Application()
  await app.init({
    width: worldWidth,
    height: worldHeight,
    backgroundAlpha: 0,
    antialias: true,
  })

  params.root.appendChild(app.canvas)

  function resizeCanvasToViewport(): void {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const scale = Math.min(
      viewportWidth / worldWidth,
      viewportHeight / worldHeight,
    )

    const cssWidth = Math.floor(worldWidth * scale)
    const cssHeight = Math.floor(worldHeight * scale)

    app.canvas.style.width = `${cssWidth}px`
    app.canvas.style.height = `${cssHeight}px`
  }

  resizeCanvasToViewport()
  window.addEventListener('resize', resizeCanvasToViewport)

  const keyboard = setupKeyboard()
  const mouse = setupMouse(app.canvas, defaultLevel)
  const roomControls = getRoomControls()
  const versusControls = getVersusControls()
  const gameStatus = getGameStatusPanel()
  const playerRoleBanner = getPlayerRoleBanner()
  const resetNoticeBanner = getResetNoticeBanner()
  roomControls.copyInviteButton.hidden = false

  const stage = new Container()
  app.stage.addChild(stage)

  const levelBackground = new Graphics()
  stage.addChild(levelBackground)

  const levelTiles = new Container()
  stage.addChild(levelTiles)

  const levelPlatforms = new Graphics()
  stage.addChild(levelPlatforms)

  const aim = new Graphics()
  drawAimArrow(aim)
  stage.addChild(aim)

  const frogTextures = createFrogTextures(frogTexture)
  const frog = new AnimatedSprite([frogTextures[0], frogTextures[1]])
  frog.anchor.set(0.5, 1)
  frog.animationSpeed = FROG_IDLE_ANIMATION_SPEED
  frog.width = FROG_RENDER_SIZE
  frog.height = FROG_RENDER_SIZE
  frog.play()
  stage.addChild(frog)

  const versusFrogContainer = new Container()
  stage.addChild(versusFrogContainer)

  const pingContainer = new Container()
  stage.addChild(pingContainer)

  const powerIndicator = new Graphics()
  stage.addChild(powerIndicator)

  let latestState: GameState | null = null
  let myPlayerId: PlayerId | null = null
  let myInviteCode = params.inviteCode
  let chargingSent = false
  let lastAimSendAt = 0
  let currentLevel = defaultLevel
  let currentTilesets = defaultTilesets
  const tilesetsByLevelId = new Map<string, LoadedTileset[]>([
    [defaultLevel.id, defaultTilesets],
  ])
  let currentLevelId = defaultLevel.id
  let currentLevelOptions = availableLevels
  let isCreator = false
  let previousIsCreator: boolean | null = null
  let latestRoundRevision = 0
  let currentFrogAnimation: FrogAnimation = 'idle'
  let lastSentPlayerName = ''
  let lastCenterNoticeMessage: string | null = null
  const versusFrogViews = new Map<FrogViewKey, FrogView>()

  drawLevel(
    levelBackground,
    levelTiles,
    currentTilesets,
    levelPlatforms,
    currentLevel,
    0,
  )
  syncLevelOptions(roomControls.select, currentLevelOptions, currentLevelId)
  roomControls.select.disabled = true
  roomControls.roomCode.textContent = myInviteCode
  gameStatus.level.textContent = currentLevel.name
  playerRoleBanner.value.textContent = 'Spectator'
  playerRoleBanner.hint.textContent = 'Waiting for a player role.'
  playerRoleBanner.nameInput.value = 'Player'

  function getMyRole(state: GameState): PlayerControlRole {
    if (!myPlayerId) {
      return 'spectator'
    }

    if (state.mode === 'versus') {
      return 'runner'
    }

    return state.roles[myPlayerId as CoopPlayerId]
  }

  function canControlRole(
    currentRole: PlayerControlRole,
    role: PlayerRole,
  ): boolean {
    if (currentRole === 'runner') {
      return true
    }

    return currentRole === role || import.meta.env.DEV
  }

  function sendInput(input: ClientInputMessage): void {
    params.room.send('input', input)
  }

  const handleVersusReadyClick = (): void => {
    const state = latestState
    if (!state || state.mode !== 'versus' || !myPlayerId) {
      return
    }

    sendInput({
      type: 'setReady',
      ready: state.versus?.ready[myPlayerId] !== true,
    })
  }

  const handleVersusRestartClick = (): void => {
    sendInput({ type: 'restartRace' })
  }

  const handleLevelChange = (): void => {
    if (!isCreator) {
      return
    }

    sendInput({
      type: 'selectLevel',
      levelId: roomControls.select.value,
    })
  }

  const sendPlayerName = (): void => {
    const nextName = playerRoleBanner.nameInput.value.trim()
    if (!myPlayerId || nextName === lastSentPlayerName) {
      return
    }

    lastSentPlayerName = nextName
    window.localStorage.setItem('frogg3r-player-name', nextName)
    sendInput({
      type: 'setName',
      name: nextName,
    })
  }

  const handlePlayerNameKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    sendPlayerName()
    playerRoleBanner.nameInput.blur()
  }

  roomControls.select.addEventListener('change', handleLevelChange)
  versusControls.readyButton.addEventListener('click', handleVersusReadyClick)
  versusControls.restartButton.addEventListener('click', handleVersusRestartClick)
  playerRoleBanner.nameInput.addEventListener('change', sendPlayerName)
  playerRoleBanner.nameInput.addEventListener(
    'keydown',
    handlePlayerNameKeyDown,
  )

  params.room.onMessage('joined', (message: JoinedMessage) => {
    myPlayerId = message.playerId
    myInviteCode = message.inviteCode
    roomControls.roomCode.textContent = myInviteCode

    const savedName = window.localStorage.getItem('frogg3r-player-name')
    if (savedName) {
      playerRoleBanner.nameInput.value = savedName
      sendPlayerName()
    }
  })

  params.room.onMessage('state', (message: StateMessage) => {
    if (message.roundRevision !== latestRoundRevision) {
      latestRoundRevision = message.roundRevision
      chargingSent = false
    }

    latestState = message.gameState
    myPlayerId = message.playerId
    const levelChanged = currentLevelId !== message.levelId
    currentLevelId = message.levelId
    currentLevelOptions = message.availableLevels
    isCreator = message.isCreator

    if (levelChanged) {
      const selectedLevel = getLevelById(message.levelId)
      const cachedTilesets = tilesetsByLevelId.get(selectedLevel.id)
      const levelRenderElapsedSeconds = getLevelRenderElapsedSeconds(
        message.gameState,
      )
      currentLevel = selectedLevel

      if (cachedTilesets) {
        currentTilesets = cachedTilesets
        drawLevel(
          levelBackground,
          levelTiles,
          currentTilesets,
          levelPlatforms,
          currentLevel,
          levelRenderElapsedSeconds,
        )
      } else {
        void loadTilesets(selectedLevel).then((tilesets) => {
          if (currentLevelId !== selectedLevel.id) {
            return
          }

          tilesetsByLevelId.set(selectedLevel.id, tilesets)
          currentTilesets = tilesets
          drawLevel(
            levelBackground,
            levelTiles,
            currentTilesets,
              levelPlatforms,
              currentLevel,
              getLevelRenderElapsedSeconds(message.gameState),
            )
          })
      }
    }

    if (!levelChanged) {
      drawLevel(
        levelBackground,
        levelTiles,
        currentTilesets,
        levelPlatforms,
        currentLevel,
        getLevelRenderElapsedSeconds(message.gameState),
      )
    }
    syncLevelOptions(roomControls.select, currentLevelOptions, currentLevel.id)
    if (previousIsCreator !== isCreator) {
      previousIsCreator = isCreator
      roomControls.select.disabled = !isCreator
    }

    const role = getMyRole(message.gameState)
    const roleHint = getRoleHint(role, message.gameState, message.playerId)
    const displayRun =
      message.gameState.mode === 'versus'
        ? message.playerId
          ? (message.gameState.versus?.runs[message.playerId]?.run ?? null)
          : null
        : message.gameState
    gameStatus.players.textContent = `${message.connectedCount}/${message.maxClients}`
    gameStatus.player.textContent = message.playerId
      ? getPlayerLabel(message.gameState, message.playerId)
      : 'spectator'
    gameStatus.creator.textContent = isCreator ? 'yes' : 'no'
    gameStatus.mode.textContent = message.mode
    gameStatus.level.textContent = currentLevel.name
    gameStatus.roles.textContent =
      message.gameState.mode === 'versus'
        ? getVersusPlayersSummary(message.gameState)
        : getPlayerRolesSummary(message.gameState)
    gameStatus.phase.textContent =
      message.gameState.mode === 'versus'
        ? (message.gameState.versus?.status ?? 'running')
        : message.gameState.phase
    gameStatus.jumps.textContent = displayRun
      ? String(displayRun.jumpCount)
      : '-'
    gameStatus.power.textContent = displayRun
      ? String(Math.round(displayRun.jumpPower))
      : '-'
    gameStatus.midAir.textContent = displayRun
      ? displayRun.midAirJumpUsed
        ? 'used'
        : 'ready'
      : '-'
    gameStatus.controls.textContent = roleHint
    playerRoleBanner.value.textContent = getRoleDisplayName(role)
    if (message.playerId) {
      const player = message.gameState.players[message.playerId]
      playerRoleBanner.nameInput.style.borderColor = colorToCss(player.color)

      if (document.activeElement !== playerRoleBanner.nameInput) {
        playerRoleBanner.nameInput.value = player.name
        lastSentPlayerName = player.name
      }
    }
    playerRoleBanner.hint.hidden =
      message.gameState.mode === 'coop' &&
      message.gameState.phase === 'finished'
    playerRoleBanner.hint.textContent = roleHint
    versusControls.panel.hidden = message.gameState.mode !== 'versus'
    if (message.gameState.mode === 'versus') {
      const versus = message.gameState.versus
      const isReady = Boolean(message.playerId && versus?.ready[message.playerId])
      versusControls.readyButton.textContent = isReady ? 'Not Ready' : 'Ready'
      versusControls.readyButton.disabled =
        !message.playerId
        || versus?.status === 'running'
        || versus?.status === 'countdown'
      versusControls.restartButton.disabled = !isCreator
      versusControls.status.textContent = getVersusControlStatus(
        message.gameState,
        message.playerId,
      )
    }
    const centerNoticeMessage = getCenterNoticeMessage(
      message.gameState,
      message.playerId,
    )
    if (centerNoticeMessage !== lastCenterNoticeMessage) {
      lastCenterNoticeMessage = centerNoticeMessage
      resetNoticeBanner.element.hidden = centerNoticeMessage === null
      resetNoticeBanner.element.textContent = centerNoticeMessage ?? ''
    }
  })

  params.room.onLeave(() => {
    params.onDisconnect()
  })

  app.ticker.add(() => {
    const gameState = latestState
    if (!gameState) {
      keyboard.state.justPressed.clear()
      return
    }

    const myRole = getMyRole(gameState)
    const now = performance.now()
    const isVersus = gameState.mode === 'versus'
    const localVersusRun =
      isVersus && myPlayerId
        ? (gameState.versus?.runs[myPlayerId]?.run ?? null)
        : null
    const activeRun = isVersus ? localVersusRun : gameState
    const canSendGameplayInput = Boolean(
      activeRun &&
      activeRun.phase !== 'finished' &&
      (!isVersus || gameState.versus?.status === 'running'),
    )
    const frogRenderPosition = activeRun
      ? getFrogRenderPosition(activeRun.frog.position)
      : { x: 0, y: 0 }

    if (mouse.state.pendingPingPosition) {
      sendInput({
        type: 'ping',
        position: mouse.state.pendingPingPosition,
      })
      mouse.state.pendingPingPosition = null
    }

    if (mouse.state.pendingDebugTeleportPosition) {
      sendInput({
        type: 'debugTeleport',
        position: mouse.state.pendingDebugTeleportPosition,
      })
      mouse.state.pendingDebugTeleportPosition = null
    }

    if (
      activeRun &&
      canSendGameplayInput &&
      canControlRole(myRole, 'direction') &&
      activeRun.phase === 'charging'
    ) {
      if (now - lastAimSendAt >= 50) {
        const directionInput = getDirectionalVector(
          mouse.state,
          frogRenderPosition,
        )
        sendInput({
          type: 'aim',
          direction: directionInput,
        })
        lastAimSendAt = now
      }
    }

    if (activeRun && canSendGameplayInput && canControlRole(myRole, 'power')) {
      const charging = keyboard.state.pressed.has('Space')
      if (charging !== chargingSent) {
        sendInput({
          type: 'charge',
          active: charging,
        })
        chargingSent = charging
      }
    } else if (chargingSent) {
      sendInput({
        type: 'charge',
        active: false,
      })
      chargingSent = false
    }

    if (
      activeRun &&
      canSendGameplayInput &&
      canControlRole(myRole, 'midJump') &&
      keyboard.state.justPressed.has('Space')
    ) {
      sendInput({
        type: 'miniJump',
      })
    }

    frog.visible = !isVersus
    versusFrogContainer.visible = isVersus
    if (isVersus) {
      renderVersusFrogs(
        versusFrogViews,
        versusFrogContainer,
        gameState,
        myPlayerId,
        frogTextures,
      )
    } else {
      frog.position.set(
        gameState.frog.position.x,
        gameState.frog.position.y + FROG_VISUAL_Y_OFFSET,
      )
      currentFrogAnimation = setFrogAnimation(
        frog,
        frogTextures,
        getFrogAnimation(gameState),
        currentFrogAnimation,
      )
      setFrogFacing(
        frog,
        gameState.phase === 'airborne'
          ? gameState.frog.velocity.x
          : gameState.jumpDirection.x,
      )
    }

    aim.position.set(frogRenderPosition.x, frogRenderPosition.y)
    aim.rotation = activeRun
      ? Math.atan2(activeRun.jumpDirection.y, activeRun.jumpDirection.x)
      : 0
    aim.visible = Boolean(activeRun && activeRun.phase === 'charging')

    const powerRatio = activeRun
      ? (activeRun.jumpPower - minJumpPower) / (maxJumpPower - minJumpPower)
      : 0
    const clampedPowerRatio = Math.max(0, Math.min(1, powerRatio))

    powerIndicator.visible = Boolean(
      activeRun && activeRun.phase === 'charging',
    )
    if (powerIndicator.visible) {
      drawPowerIndicator(
        powerIndicator,
        frogRenderPosition,
        activeRun?.jumpDirection ?? { x: 0, y: -1 },
        clampedPowerRatio,
      )
    } else {
      powerIndicator.clear()
    }
    drawPings(pingContainer, gameState)

    keyboard.state.justPressed.clear()
  })

  return {
    destroy: () => {
      roomControls.select.removeEventListener('change', handleLevelChange)
      versusControls.readyButton.removeEventListener('click', handleVersusReadyClick)
      versusControls.restartButton.removeEventListener('click', handleVersusRestartClick)
      playerRoleBanner.nameInput.removeEventListener('change', sendPlayerName)
      playerRoleBanner.nameInput.removeEventListener(
        'keydown',
        handlePlayerNameKeyDown,
      )
      roomControls.copyInviteButton.hidden = true
      keyboard.destroy()
      mouse.destroy()
      window.removeEventListener('resize', resizeCanvasToViewport)
      app.destroy(undefined, { children: true })
      if (app.canvas.parentElement === params.root) {
        params.root.removeChild(app.canvas)
      }
    },
    getInviteCode: () => myInviteCode,
  }
}

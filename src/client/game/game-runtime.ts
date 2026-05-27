import type { Room } from 'colyseus.js'
import { Application, Container, Graphics } from 'pixi.js'

import {
  frogRadius,
  maxJumpPower,
  minJumpPower,
  worldHeight,
  worldWidth,
} from '@shared/constants/game'
import { availableLevels, getDefaultLevel, getLevelById } from '@shared/levels'
import type { GameState, PlayerId, PlayerRole, Vector2 } from '@shared/types/game-state'
import type { LevelData, LevelSummary } from '@shared/types/level'
import type { ClientInputMessage, JoinedMessage, StateMessage } from '@shared/types/network'

interface KeyboardState {
  pressed: Set<string>
  justPressed: Set<string>
}

interface MouseState {
  x: number
  y: number
  isInsideCanvas: boolean
}

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

interface KeyboardSetup {
  state: KeyboardState
  destroy: () => void
}

interface MouseSetup {
  state: MouseState
  destroy: () => void
}

interface RoomControls {
  panel: HTMLDivElement
  copyInviteButton: HTMLButtonElement
  roomCode: HTMLSpanElement
  select: HTMLSelectElement
  note: HTMLParagraphElement
}

interface GameStatusPanel {
  panel: HTMLDivElement
  players: HTMLSpanElement
  player: HTMLSpanElement
  creator: HTMLSpanElement
  level: HTMLSpanElement
  roles: HTMLSpanElement
  phase: HTMLSpanElement
  jumps: HTMLSpanElement
  power: HTMLSpanElement
  midAir: HTMLSpanElement
}

interface PlayerRoleBanner {
  value: HTMLSpanElement
}

function mustGetElementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element #${id}`)
  }

  return element as T
}

function setupKeyboard(): KeyboardSetup {
  const state: KeyboardState = {
    pressed: new Set<string>(),
    justPressed: new Set<string>(),
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      event.preventDefault()
    }

    if (!state.pressed.has(event.code)) {
      state.justPressed.add(event.code)
    }

    state.pressed.add(event.code)
  }

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      event.preventDefault()
    }

    state.pressed.delete(event.code)
  }

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  return {
    state,
    destroy: () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    },
  }
}

function setupMouse(canvas: HTMLCanvasElement, level: LevelData): MouseSetup {
  const state: MouseState = {
    x: level.worldWidth / 2,
    y: level.spawn.y - 160,
    isInsideCanvas: false,
  }

  const handlePointerMove = (event: PointerEvent): void => {
    const bounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / bounds.width
    const scaleY = canvas.height / bounds.height

    state.x = (event.clientX - bounds.left) * scaleX
    state.y = (event.clientY - bounds.top) * scaleY
    state.isInsideCanvas = true
  }

  const handlePointerLeave = (): void => {
    state.isInsideCanvas = false
  }

  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerleave', handlePointerLeave)

  return {
    state,
    destroy: () => {
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    },
  }
}

function getDirectionalVector(mouse: MouseState, frogRenderPosition: Vector2): Vector2 {
  if (!mouse.isInsideCanvas) {
    return { x: 0, y: -1 }
  }

  return {
    x: mouse.x - frogRenderPosition.x,
    y: mouse.y - frogRenderPosition.y,
  }
}

function getFrogRenderPosition(frogPosition: Vector2): Vector2 {
  return {
    x: frogPosition.x,
    y: frogPosition.y - frogRadius,
  }
}

function getRoomControls(): RoomControls {
  return {
    panel: mustGetElementById<HTMLDivElement>('room-controls'),
    copyInviteButton: mustGetElementById<HTMLButtonElement>('copy-invite-ingame'),
    roomCode: mustGetElementById<HTMLSpanElement>('room-code'),
    select: mustGetElementById<HTMLSelectElement>('level-select'),
    note: mustGetElementById<HTMLParagraphElement>('level-note'),
  }
}
function getGameStatusPanel(): GameStatusPanel {
  return {
    panel: mustGetElementById<HTMLDivElement>('game-status'),
    players: mustGetElementById<HTMLSpanElement>('status-players'),
    player: mustGetElementById<HTMLSpanElement>('status-player'),
    creator: mustGetElementById<HTMLSpanElement>('status-creator'),
    level: mustGetElementById<HTMLSpanElement>('status-level'),
    roles: mustGetElementById<HTMLSpanElement>('status-roles'),
    phase: mustGetElementById<HTMLSpanElement>('status-phase'),
    jumps: mustGetElementById<HTMLSpanElement>('status-jumps'),
    power: mustGetElementById<HTMLSpanElement>('status-power'),
    midAir: mustGetElementById<HTMLSpanElement>('status-midair'),
  }
}

function getPlayerRoleBanner(): PlayerRoleBanner {
  return {
    value: mustGetElementById<HTMLSpanElement>('player-role-value'),
  }
}

function syncLevelOptions(
  select: HTMLSelectElement,
  levels: LevelSummary[],
  selectedLevelId: string,
): void {
  const nextSignature = levels.map((level) => `${level.id}:${level.name}`).join('|')
  if (select.dataset.optionsSignature !== nextSignature) {
    select.replaceChildren(
      ...levels.map((level) => {
        const option = document.createElement('option')
        option.value = level.id
        option.textContent = level.name
        return option
      }),
    )
    select.dataset.optionsSignature = nextSignature
  }

  if (select.value !== selectedLevelId) {
    select.value = selectedLevelId
  }
}

function drawLevel(background: Graphics, platforms: Graphics, level: LevelData): void {
  background.clear()
  background.rect(0, 0, level.worldWidth, level.worldHeight)
  background.fill(level.backgroundColor)

  platforms.clear()
  for (const platform of level.platforms) {
    const radius = platform.height >= 24 ? 12 : 8
    platforms.roundRect(platform.x, platform.y, platform.width, platform.height, radius)
    platforms.fill(level.platformColor)
  }
}

export async function startGameRuntime(params: StartGameRuntimeParams): Promise<GameRuntime> {
  const defaultLevel = getDefaultLevel()
  const powerBarX = worldWidth - 272
  const powerBarY = worldHeight - 52
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
    const scale = Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight)

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
  const gameStatus = getGameStatusPanel()
  const playerRoleBanner = getPlayerRoleBanner()
  roomControls.copyInviteButton.hidden = false

  const stage = new Container()
  app.stage.addChild(stage)

  const levelBackground = new Graphics()
  stage.addChild(levelBackground)

  const levelPlatforms = new Graphics()
  stage.addChild(levelPlatforms)

  const frog = new Graphics()
  frog.circle(0, 0, frogRadius)
  frog.fill(0x72be5a)
  stage.addChild(frog)

  const directionLine = new Graphics()
  stage.addChild(directionLine)

  const powerBarBg = new Graphics()
  powerBarBg.roundRect(powerBarX, powerBarY, 220, 20, 10)
  powerBarBg.fill(0x0f1a13)
  stage.addChild(powerBarBg)

  const powerBarFill = new Graphics()
  stage.addChild(powerBarFill)

  let latestState: GameState | null = null
  let myPlayerId: PlayerId | null = null
  let myInviteCode = params.inviteCode
  let chargingSent = false
  let lastAimSendAt = 0
  let currentLevel = defaultLevel
  let currentLevelId = defaultLevel.id
  let currentLevelOptions = availableLevels
  let isCreator = false
  let latestRoundRevision = 0

  drawLevel(levelBackground, levelPlatforms, currentLevel)
  syncLevelOptions(roomControls.select, currentLevelOptions, currentLevelId)
  roomControls.roomCode.textContent = myInviteCode
  gameStatus.level.textContent = currentLevel.name
  playerRoleBanner.value.textContent = 'Spectator'

  function getMyRole(state: GameState): PlayerRole | 'spectator' {
    if (!myPlayerId) {
      return 'spectator'
    }

    return state.roles[myPlayerId]
  }

  function sendInput(input: ClientInputMessage): void {
    params.room.send('input', input)
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

  roomControls.select.addEventListener('change', handleLevelChange)

  params.room.onMessage('joined', (message: JoinedMessage) => {
    myPlayerId = message.playerId
    myInviteCode = message.inviteCode
    roomControls.roomCode.textContent = myInviteCode
  })

  params.room.onMessage('state', (message: StateMessage) => {
    if (message.roundRevision !== latestRoundRevision) {
      latestRoundRevision = message.roundRevision
      chargingSent = false
    }

    latestState = message.gameState
    myPlayerId = message.playerId
    currentLevelId = message.levelId
    currentLevelOptions = message.availableLevels
    isCreator = message.isCreator

    currentLevel = getLevelById(message.levelId)
    drawLevel(levelBackground, levelPlatforms, currentLevel)
    syncLevelOptions(roomControls.select, currentLevelOptions, currentLevel.id)
    roomControls.roomCode.textContent = myInviteCode
    roomControls.select.disabled = !isCreator
    roomControls.note.textContent = isCreator
      ? 'You created this room. Changing level resets the frog run.'
      : 'Only the room creator can switch the level.'

    const roleText = message.playerId ? message.gameState.roles[message.playerId] : 'spectator'
    gameStatus.players.textContent = `${message.connectedCount}/3`
    gameStatus.player.textContent = message.playerId ?? 'spectator'
    gameStatus.creator.textContent = isCreator ? 'yes' : 'no'
    gameStatus.level.textContent = currentLevel.name
    gameStatus.roles.textContent = `P1 ${message.gameState.roles.player1} | P2 ${message.gameState.roles.player2} | P3 ${message.gameState.roles.player3}`
    gameStatus.phase.textContent = message.gameState.phase
    gameStatus.jumps.textContent = String(message.gameState.jumpCount)
    gameStatus.power.textContent = String(Math.round(message.gameState.jumpPower))
    gameStatus.midAir.textContent = message.gameState.midAirJumpUsed ? 'used' : 'ready'
    playerRoleBanner.value.textContent = roleText
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
    const frogRenderPosition = getFrogRenderPosition(gameState.frog.position)

    if (myRole === 'direction' && gameState.phase === 'charging') {
      if (now - lastAimSendAt >= 50) {
        const directionInput = getDirectionalVector(mouse.state, frogRenderPosition)
        sendInput({
          type: 'aim',
          direction: directionInput,
        })
        lastAimSendAt = now
      }
    }

    if (myRole === 'power') {
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

    if (myRole === 'midJump' && keyboard.state.justPressed.has('Space')) {
      sendInput({
        type: 'miniJump',
      })
    }

    frog.position.set(frogRenderPosition.x, frogRenderPosition.y)

    directionLine.clear()
    directionLine.moveTo(frogRenderPosition.x, frogRenderPosition.y)
    directionLine.lineTo(
      frogRenderPosition.x + (gameState.jumpDirection.x * 48),
      frogRenderPosition.y + (gameState.jumpDirection.y * 48),
    )
    directionLine.stroke({ color: 0x101911, width: 3 })

    const powerRatio = (gameState.jumpPower - minJumpPower) / (maxJumpPower - minJumpPower)
    const clampedPowerRatio = Math.max(0, Math.min(1, powerRatio))

    powerBarFill.clear()
    powerBarFill.roundRect(powerBarX + 2, powerBarY + 2, 216 * clampedPowerRatio, 16, 8)
    powerBarFill.fill(0x7bdc67)

    keyboard.state.justPressed.clear()
  })

  return {
    destroy: () => {
      roomControls.select.removeEventListener('change', handleLevelChange)
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

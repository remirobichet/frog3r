import type { Room } from 'colyseus.js'
import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js'

import frogSpritesheetUrl from '@client/assets/frog/frog.png'
import aimHudUrl from '@client/assets/hud/aim.png'
import powerbarHudUrl from '@client/assets/hud/powerbar.png'
import terrainTilesetUrl from '@client/assets/tiles/full.png'
import {
  frogRadius,
  maxJumpPower,
  minJumpPower,
  worldHeight,
  worldWidth,
} from '@shared/constants/game'
import { availableLevels, getDefaultLevel, getLevelById } from '@shared/levels'
import type {
  GameState,
  PlayerId,
  PlayerRole,
  Vector2,
} from '@shared/types/game-state'
import type { LevelData, LevelSummary } from '@shared/types/level'
import type {
  ClientInputMessage,
  JoinedMessage,
  StateMessage,
} from '@shared/types/network'

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
  panel: HTMLDetailsElement
  players: HTMLSpanElement
  player: HTMLSpanElement
  creator: HTMLSpanElement
  level: HTMLSpanElement
  roles: HTMLSpanElement
  phase: HTMLSpanElement
  jumps: HTMLSpanElement
  power: HTMLSpanElement
  midAir: HTMLSpanElement
  controls: HTMLSpanElement
}

interface LoadedTileset {
  firstgid: number
  texture: Texture
  columns: number
}

interface PlayerRoleBanner {
  value: HTMLSpanElement
  hint: HTMLParagraphElement
}

type FrogAnimation = 'idle' | 'jump' | 'landing'

const FROG_FRAME_SIZE = 160
const FROG_RENDER_SIZE = frogRadius * 4
const FROG_VISUAL_Y_OFFSET = 24
const AIM_RENDER_SIZE = 96
const POWER_BAR_FRAME_WIDTH = 420
const POWER_BAR_FRAME_HEIGHT = 84
const POWER_BAR_BOTTOM_OFFSET = 28
const POWER_BAR_BACKING_PADDING_X = 12
const POWER_BAR_BACKING_PADDING_Y = 10
const POWER_BAR_FILL_X_OFFSET = 34
const POWER_BAR_FILL_Y_OFFSET = 25
const POWER_BAR_FILL_WIDTH = 352
const POWER_BAR_FILL_HEIGHT = 34
const tileAssetUrls = import.meta.glob<string>('../assets/tiles/**/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
})

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

function getDirectionalVector(
  mouse: MouseState,
  frogRenderPosition: Vector2,
): Vector2 {
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
    copyInviteButton:
      mustGetElementById<HTMLButtonElement>('copy-invite-ingame'),
    roomCode: mustGetElementById<HTMLSpanElement>('room-code'),
    select: mustGetElementById<HTMLSelectElement>('level-select'),
    note: mustGetElementById<HTMLParagraphElement>('level-note'),
  }
}
function getGameStatusPanel(): GameStatusPanel {
  return {
    panel: mustGetElementById<HTMLDetailsElement>('game-status'),
    players: mustGetElementById<HTMLSpanElement>('status-players'),
    player: mustGetElementById<HTMLSpanElement>('status-player'),
    creator: mustGetElementById<HTMLSpanElement>('status-creator'),
    level: mustGetElementById<HTMLSpanElement>('status-level'),
    roles: mustGetElementById<HTMLSpanElement>('status-roles'),
    phase: mustGetElementById<HTMLSpanElement>('status-phase'),
    jumps: mustGetElementById<HTMLSpanElement>('status-jumps'),
    power: mustGetElementById<HTMLSpanElement>('status-power'),
    midAir: mustGetElementById<HTMLSpanElement>('status-midair'),
    controls: mustGetElementById<HTMLSpanElement>('status-controls'),
  }
}

function getPlayerRoleBanner(): PlayerRoleBanner {
  return {
    value: mustGetElementById<HTMLSpanElement>('player-role-value'),
    hint: mustGetElementById<HTMLParagraphElement>('player-control-hint'),
  }
}

function syncLevelOptions(
  select: HTMLSelectElement,
  levels: LevelSummary[],
  selectedLevelId: string,
): void {
  const nextSignature = levels
    .map((level) => `${level.id}:${level.name}`)
    .join('|')
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

function getRoleDisplayName(role: PlayerRole | 'spectator'): string {
  if (role === 'direction') {
    return 'Aim'
  }

  if (role === 'power') {
    return 'Charge'
  }

  if (role === 'midJump') {
    return 'Mid-jump'
  }

  return 'Spectator'
}

function getRoleHint(role: PlayerRole | 'spectator', state: GameState): string {
  if (state.phase === 'finished') {
    const jumps = state.finishedAtJumpCount ?? state.jumpCount
    const jumpLabel = jumps === 1 ? 'jump' : 'jumps'
    return `Finish reached in ${jumps} ${jumpLabel}. Change level to run again.`
  }

  if (role === 'direction') {
    return state.phase === 'charging'
      ? 'Guide the arc with your cursor before your teammate releases.'
      : 'The frog is airborne. Watch the landing and prepare for the next aim.'
  }

  if (role === 'power') {
    return state.phase === 'charging'
      ? 'Hold Space to build power, then release to launch.'
      : 'Launch committed. Wait for the landing to receive your next role.'
  }

  if (role === 'midJump') {
    if (state.phase === 'airborne' && !state.midAirJumpUsed) {
      return 'Press Space at the right moment for the second jump.'
    }

    return 'Save your timing for the airborne second jump.'
  }

  return 'You are watching this run. Join with an open player slot to take a role.'
}

function drawTileLayers(
  tileContainer: Container,
  tilesets: LoadedTileset[],
  level: LevelData,
): void {
  tileContainer.removeChildren()

  if (tilesets.length === 0) {
    return
  }

  for (const layer of level.tileLayers) {
    const layerContainer = new Container()
    layerContainer.alpha = layer.opacity

    for (let index = 0; index < layer.data.length; index += 1) {
      const gid = layer.data[index] & 0x1fffffff
      if (gid <= 0) {
        continue
      }

      const tileset = getTilesetForGid(gid, tilesets)
      if (!tileset) {
        continue
      }

      const tileIndex = gid - tileset.firstgid
      const sourceX = (tileIndex % tileset.columns) * level.tileWidth
      const sourceY = Math.floor(tileIndex / tileset.columns) * level.tileHeight
      const texture = new Texture({
        source: tileset.texture.source,
        frame: new Rectangle(
          sourceX,
          sourceY,
          level.tileWidth,
          level.tileHeight,
        ),
      })
      const sprite = new Sprite(texture)

      sprite.x = (index % layer.width) * level.tileWidth
      sprite.y = Math.floor(index / layer.width) * level.tileHeight
      layerContainer.addChild(sprite)
    }

    tileContainer.addChild(layerContainer)
  }
}

function getTilesetForGid(gid: number, tilesets: LoadedTileset[]): LoadedTileset | null {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (tileset && gid >= tileset.firstgid) {
      return tileset
    }
  }

  return null
}

function getTilesetAssetUrl(source: string): string | null {
  const pngPath = source.replace(/\.tsx$/, '.png')
  const scaledPath = `../assets/tiles/four-season-40/${pngPath.replace(/^four-season\//, '')}`
  const originalPath = `../assets/tiles/${pngPath}`

  return tileAssetUrls[scaledPath] ?? tileAssetUrls[originalPath] ?? null
}

async function loadTilesets(level: LevelData): Promise<LoadedTileset[]> {
  if (level.tilesets.length === 0) {
    const texture = await Assets.load<Texture>(terrainTilesetUrl)
    return [
      {
        firstgid: 1,
        texture,
        columns: Math.floor(texture.width / level.tileWidth),
      },
    ]
  }

  const loadedTilesets = await Promise.all(
    level.tilesets.map(async (tileset) => {
      const assetUrl = getTilesetAssetUrl(tileset.source)
      if (!assetUrl) {
        throw new Error(`Missing tileset asset for ${tileset.source}`)
      }

      const texture = await Assets.load<Texture>(assetUrl)
      return {
        firstgid: tileset.firstgid,
        texture,
        columns: Math.floor(texture.width / level.tileWidth),
      }
    }),
  )

  return loadedTilesets.filter((tileset) => tileset.columns > 0)
}

function createFrogTextures(frogTexture: Texture): Texture[] {
  return Array.from(
    { length: 4 },
    (_, index) =>
      new Texture({
        source: frogTexture.source,
        frame: new Rectangle(
          index * FROG_FRAME_SIZE,
          0,
          FROG_FRAME_SIZE,
          FROG_FRAME_SIZE,
        ),
      }),
  )
}

function getFrogAnimation(gameState: GameState): FrogAnimation {
  if (gameState.phase === 'charging' || gameState.phase === 'finished') {
    return 'idle'
  }

  if (gameState.frog.velocity.y < 0) {
    return 'jump'
  }

  return 'landing'
}

function setFrogAnimation(
  frog: AnimatedSprite,
  frogTextures: Texture[],
  nextAnimation: FrogAnimation,
  currentAnimation: FrogAnimation,
): FrogAnimation {
  if (nextAnimation === currentAnimation) {
    return currentAnimation
  }

  if (nextAnimation === 'idle') {
    frog.textures = [frogTextures[0], frogTextures[1]]
    frog.gotoAndPlay(0)
    return nextAnimation
  }

  frog.textures = [frogTextures[nextAnimation === 'jump' ? 2 : 3]]
  frog.gotoAndStop(0)
  return nextAnimation
}

function drawLevel(
  background: Graphics,
  tiles: Container,
  tilesets: LoadedTileset[],
  platforms: Graphics,
  level: LevelData,
): void {
  background.clear()
  background.rect(0, 0, level.worldWidth, level.worldHeight)
  background.fill(level.backgroundColor)

  drawTileLayers(tiles, tilesets, level)

  platforms.clear()
}

export async function startGameRuntime(
  params: StartGameRuntimeParams,
): Promise<GameRuntime> {
  const defaultLevel = getDefaultLevel()
  const powerBarX = (worldWidth - POWER_BAR_FRAME_WIDTH) / 2
  const powerBarY =
    worldHeight - POWER_BAR_FRAME_HEIGHT - POWER_BAR_BOTTOM_OFFSET
  const defaultTilesets = await loadTilesets(defaultLevel)
  const frogTexture = await Assets.load<Texture>(frogSpritesheetUrl)
  const aimTexture = await Assets.load<Texture>(aimHudUrl)
  const powerbarTexture = await Assets.load<Texture>(powerbarHudUrl)
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
  const gameStatus = getGameStatusPanel()
  const playerRoleBanner = getPlayerRoleBanner()
  roomControls.copyInviteButton.hidden = false

  const stage = new Container()
  app.stage.addChild(stage)

  const levelBackground = new Graphics()
  stage.addChild(levelBackground)

  const levelTiles = new Container()
  stage.addChild(levelTiles)

  const levelPlatforms = new Graphics()
  stage.addChild(levelPlatforms)

  const aim = new Sprite(aimTexture)
  aim.anchor.set(0.08, 0.5)
  aim.width = AIM_RENDER_SIZE
  aim.height = AIM_RENDER_SIZE
  stage.addChild(aim)

  const frogTextures = createFrogTextures(frogTexture)
  const frog = new AnimatedSprite([frogTextures[0], frogTextures[1]])
  frog.anchor.set(0.5, 1)
  frog.animationSpeed = 0.06
  frog.width = FROG_RENDER_SIZE
  frog.height = FROG_RENDER_SIZE
  frog.play()
  stage.addChild(frog)

  const powerBarBacking = new Graphics()
  powerBarBacking.roundRect(
    powerBarX - POWER_BAR_BACKING_PADDING_X,
    powerBarY - POWER_BAR_BACKING_PADDING_Y,
    POWER_BAR_FRAME_WIDTH + POWER_BAR_BACKING_PADDING_X * 2,
    POWER_BAR_FRAME_HEIGHT + POWER_BAR_BACKING_PADDING_Y * 2,
    24,
  )
  powerBarBacking.fill({ color: 0x06100c, alpha: 0.72 })
  stage.addChild(powerBarBacking)

  const powerBarFill = new Graphics()
  stage.addChild(powerBarFill)

  const powerBarFrame = new Sprite(powerbarTexture)
  powerBarFrame.position.set(powerBarX, powerBarY)
  powerBarFrame.width = POWER_BAR_FRAME_WIDTH
  powerBarFrame.height = POWER_BAR_FRAME_HEIGHT
  stage.addChild(powerBarFrame)

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
  let latestRoundRevision = 0
  let currentFrogAnimation: FrogAnimation = 'idle'

  drawLevel(
    levelBackground,
    levelTiles,
    currentTilesets,
    levelPlatforms,
    currentLevel,
  )
  syncLevelOptions(roomControls.select, currentLevelOptions, currentLevelId)
  roomControls.roomCode.textContent = myInviteCode
  gameStatus.level.textContent = currentLevel.name
  playerRoleBanner.value.textContent = 'Spectator'
  playerRoleBanner.hint.textContent = 'Waiting for a player role.'

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
    const levelChanged = currentLevelId !== message.levelId
    currentLevelId = message.levelId
    currentLevelOptions = message.availableLevels
    isCreator = message.isCreator

    if (levelChanged) {
      const selectedLevel = getLevelById(message.levelId)
      const cachedTilesets = tilesetsByLevelId.get(selectedLevel.id)
      currentLevel = selectedLevel

      if (cachedTilesets) {
        currentTilesets = cachedTilesets
        drawLevel(
          levelBackground,
          levelTiles,
          currentTilesets,
          levelPlatforms,
          currentLevel,
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
      )
    }
    syncLevelOptions(roomControls.select, currentLevelOptions, currentLevel.id)
    roomControls.roomCode.textContent = myInviteCode
    roomControls.select.disabled = !isCreator
    roomControls.note.textContent = isCreator
      ? 'You created this room. Changing level resets the frog run.'
      : 'Only the room creator can switch the level.'

    const role = message.playerId
      ? message.gameState.roles[message.playerId]
      : 'spectator'
    const roleHint = getRoleHint(role, message.gameState)
    gameStatus.players.textContent = `${message.connectedCount}/3`
    gameStatus.player.textContent = message.playerId ?? 'spectator'
    gameStatus.creator.textContent = isCreator ? 'yes' : 'no'
    gameStatus.level.textContent = currentLevel.name
    gameStatus.roles.textContent = `P1 ${message.gameState.roles.player1} | P2 ${message.gameState.roles.player2} | P3 ${message.gameState.roles.player3}`
    gameStatus.phase.textContent = message.gameState.phase
    gameStatus.jumps.textContent = String(message.gameState.jumpCount)
    gameStatus.power.textContent = String(
      Math.round(message.gameState.jumpPower),
    )
    gameStatus.midAir.textContent = message.gameState.midAirJumpUsed
      ? 'used'
      : 'ready'
    gameStatus.controls.textContent = roleHint
    playerRoleBanner.value.textContent = getRoleDisplayName(role)
    playerRoleBanner.hint.textContent = roleHint
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

    aim.position.set(frogRenderPosition.x, frogRenderPosition.y)
    aim.rotation = Math.atan2(
      gameState.jumpDirection.y,
      gameState.jumpDirection.x,
    )
    aim.visible = gameState.phase === 'charging'

    const powerRatio =
      (gameState.jumpPower - minJumpPower) / (maxJumpPower - minJumpPower)
    const clampedPowerRatio = Math.max(0, Math.min(1, powerRatio))

    powerBarFill.clear()
    powerBarBacking.visible = gameState.phase !== 'finished'
    powerBarFrame.visible = gameState.phase !== 'finished'
    powerBarFill.visible = gameState.phase !== 'finished'
    powerBarFill.roundRect(
      powerBarX + POWER_BAR_FILL_X_OFFSET,
      powerBarY + POWER_BAR_FILL_Y_OFFSET,
      POWER_BAR_FILL_WIDTH * clampedPowerRatio,
      POWER_BAR_FILL_HEIGHT,
      POWER_BAR_FILL_HEIGHT / 2,
    )
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

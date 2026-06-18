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
import terrainTilesetUrl from '@client/assets/tiles/full.png'
import {
  frogRadius,
  maxJumpPower,
  minJumpPower,
  worldHeight,
  worldWidth,
} from '@shared/constants/game'
import { availableLevels, getDefaultLevel, getLevelById } from '@shared/levels'
import { getPlatformPosition } from '@shared/utils/gameplay'
import type {
  GameState,
  PlayerId,
  PlayerRole,
  Vector2,
} from '@shared/types/game-state'
import type { LevelData, LevelSummary, Platform } from '@shared/types/level'
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
  pendingPingPosition: Vector2 | null
  pendingDebugTeleportPosition: Vector2 | null
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
  frameTextures: Map<number, Texture>
}

interface PlayerRoleBanner {
  value: HTMLSpanElement
  hint: HTMLParagraphElement
  nameInput: HTMLInputElement
}

interface ResetNoticeBanner {
  element: HTMLParagraphElement
}

type FrogAnimation = 'idle' | 'jump' | 'landing'

const FROG_FRAME_SIZE = 160
const FROG_RENDER_SIZE = frogRadius * 4
const FROG_VISUAL_Y_OFFSET = 24
const FROG_FACING_DEAD_ZONE = 0.01
const AIM_RENDER_SIZE = 96
const POWER_INDICATOR_WIDTH = 76
const POWER_INDICATOR_HEIGHT = 10
const POWER_INDICATOR_DISTANCE = 78
const POWER_INDICATOR_HIGH_POWER_THRESHOLD = 0.72
const PING_LIFETIME_SECONDS = 2
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

function isEditableEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

function setupKeyboard(): KeyboardSetup {
  const state: KeyboardState = {
    pressed: new Set<string>(),
    justPressed: new Set<string>(),
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableEventTarget(event.target)) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
    }

    if (!state.pressed.has(event.code)) {
      state.justPressed.add(event.code)
    }

    state.pressed.add(event.code)
  }

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (isEditableEventTarget(event.target)) {
      return
    }

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
    pendingPingPosition: null,
    pendingDebugTeleportPosition: null,
  }

  const getCanvasPosition = (event: PointerEvent): Vector2 => {
    const bounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / bounds.width
    const scaleY = canvas.height / bounds.height

    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
    }
  }

  const handlePointerMove = (event: PointerEvent): void => {
    const position = getCanvasPosition(event)
    state.x = position.x
    state.y = position.y
    state.isInsideCanvas = true
  }

  const handlePointerDown = (event: PointerEvent): void => {
    const position = getCanvasPosition(event)
    state.x = position.x
    state.y = position.y
    state.isInsideCanvas = true

    if (event.button === 1 && import.meta.env.DEV) {
      event.preventDefault()
      state.pendingDebugTeleportPosition = position
      return
    }

    if (event.button !== 0) {
      return
    }

    state.pendingPingPosition = position
  }

  const handlePointerLeave = (): void => {
    state.isInsideCanvas = false
  }

  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerdown', handlePointerDown)
  canvas.addEventListener('pointerleave', handlePointerLeave)

  return {
    state,
    destroy: () => {
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerdown', handlePointerDown)
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

function intersectsRect(
  leftX: number,
  leftY: number,
  leftWidth: number,
  leftHeight: number,
  rightX: number,
  rightY: number,
  rightWidth: number,
  rightHeight: number,
): boolean {
  return (
    leftX < rightX + rightWidth &&
    leftX + leftWidth > rightX &&
    leftY < rightY + rightHeight &&
    leftY + leftHeight > rightY
  )
}

function getRoomControls(): RoomControls {
  return {
    panel: mustGetElementById<HTMLDivElement>('room-controls'),
    copyInviteButton:
      mustGetElementById<HTMLButtonElement>('copy-invite-ingame'),
    roomCode: mustGetElementById<HTMLSpanElement>('room-code'),
    select: mustGetElementById<HTMLSelectElement>('level-select'),
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
    nameInput: mustGetElementById<HTMLInputElement>('player-name-input'),
  }
}

function getResetNoticeBanner(): ResetNoticeBanner {
  return {
    element: mustGetElementById<HTMLParagraphElement>('reset-notice'),
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

function getCenterNoticeMessage(state: GameState): string | null {
  if (state.resetNotice) {
    return state.resetNotice.message
  }

  if (state.phase === 'finished') {
    const jumps = state.finishedAtJumpCount ?? state.jumpCount
    const jumpLabel = jumps === 1 ? 'jump' : 'jumps'
    return `You won in ${jumps} ${jumpLabel}!`
  }

  return null
}

function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function getPlayerLabel(state: GameState, playerId: PlayerId): string {
  return state.players[playerId].name
}

function getPlayerRolesSummary(state: GameState): string {
  return (['player1', 'player2', 'player3'] as PlayerId[])
    .map((playerId) => {
      const player = state.players[playerId]
      const connectionLabel = player.connected ? '' : ' (offline)'
      return `${player.name}: ${state.roles[playerId]}${connectionLabel}`
    })
    .join(' | ')
}

function drawPings(pingContainer: Container, state: GameState): void {
  clearContainerChildren(pingContainer)

  for (const ping of state.pings) {
    const player = state.players[ping.playerId]
    const ageSeconds = state.elapsedSeconds - ping.createdAtSeconds
    const progress = Math.max(
      0,
      Math.min(1, ageSeconds / PING_LIFETIME_SECONDS),
    )
    const alpha = 1 - progress
    const radius = 18 + progress * 16
    const marker = new Graphics()

    marker.circle(ping.position.x, ping.position.y, radius)
    marker.stroke({ color: player.color, width: 5, alpha })
    marker.circle(ping.position.x, ping.position.y, 5)
    marker.fill({ color: player.color, alpha: Math.max(0.24, alpha) })

    pingContainer.addChild(marker)
  }
}

function clearContainerChildren(container: Container): void {
  for (const child of container.removeChildren()) {
    child.destroy({ children: true, context: true })
  }
}

function getTileTexture(
  tileset: LoadedTileset,
  tileIndex: number,
  tileWidth: number,
  tileHeight: number,
): Texture {
  const cachedTexture = tileset.frameTextures.get(tileIndex)
  if (cachedTexture) {
    return cachedTexture
  }

  const sourceX = (tileIndex % tileset.columns) * tileWidth
  const sourceY = Math.floor(tileIndex / tileset.columns) * tileHeight
  const texture = new Texture({
    source: tileset.texture.source,
    frame: new Rectangle(sourceX, sourceY, tileWidth, tileHeight),
  })

  tileset.frameTextures.set(tileIndex, texture)
  return texture
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

function drawTileLayers(
  tileContainer: Container,
  tilesets: LoadedTileset[],
  level: LevelData,
  elapsedSeconds: number,
): Set<Platform> {
  clearContainerChildren(tileContainer)
  const movingPlatformsWithTiles = new Set<Platform>()

  if (tilesets.length === 0) {
    return movingPlatformsWithTiles
  }

  const movingPlatforms = level.platforms.filter(
    (platform) => platform.movement,
  )

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
      const texture = getTileTexture(
        tileset,
        tileIndex,
        level.tileWidth,
        level.tileHeight,
      )
      const sprite = new Sprite(texture)
      const tileX = (index % layer.width) * level.tileWidth
      const tileY = Math.floor(index / layer.width) * level.tileHeight
      const movingPlatform = movingPlatforms.find((platform) =>
        intersectsRect(
          tileX,
          tileY,
          level.tileWidth,
          level.tileHeight,
          platform.x,
          platform.y,
          platform.width,
          platform.height,
        ),
      )

      if (movingPlatform) {
        movingPlatformsWithTiles.add(movingPlatform)
        const platformPosition = getPlatformPosition(
          movingPlatform,
          elapsedSeconds,
        )
        sprite.x = platformPosition.x + tileX - movingPlatform.x
        sprite.y = platformPosition.y + tileY - movingPlatform.y
      } else {
        sprite.x = tileX
        sprite.y = tileY
      }
      layerContainer.addChild(sprite)
    }

    tileContainer.addChild(layerContainer)
  }

  return movingPlatformsWithTiles
}

function getTilesetForGid(
  gid: number,
  tilesets: LoadedTileset[],
): LoadedTileset | null {
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
        frameTextures: new Map<number, Texture>(),
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
        frameTextures: new Map<number, Texture>(),
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

function setFrogFacing(
  frog: AnimatedSprite,
  horizontalDirection: number,
): void {
  if (Math.abs(horizontalDirection) <= FROG_FACING_DEAD_ZONE) {
    return
  }

  const horizontalScale = Math.abs(frog.scale.x)
  frog.scale.x = horizontalDirection < 0 ? -horizontalScale : horizontalScale
}

function drawLevel(
  background: Graphics,
  tiles: Container,
  tilesets: LoadedTileset[],
  platforms: Graphics,
  level: LevelData,
  elapsedSeconds: number,
): void {
  background.clear()
  background.rect(0, 0, level.worldWidth, level.worldHeight)
  background.fill(level.backgroundColor)

  const movingPlatformsWithTiles = drawTileLayers(
    tiles,
    tilesets,
    level,
    elapsedSeconds,
  )

  platforms.clear()
  for (const platform of level.platforms) {
    if (!platform.movement || movingPlatformsWithTiles.has(platform)) {
      continue
    }

    const position = getPlatformPosition(platform, elapsedSeconds)
    platforms.rect(position.x, position.y, platform.width, platform.height)
    platforms.fill({ color: level.platformColor, alpha: 0.28 })
  }
}

export async function startGameRuntime(
  params: StartGameRuntimeParams,
): Promise<GameRuntime> {
  const defaultLevel = getDefaultLevel()
  const defaultTilesets = await loadTilesets(defaultLevel)
  const frogTexture = await Assets.load<Texture>(frogSpritesheetUrl)
  const aimTexture = await Assets.load<Texture>(aimHudUrl)
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

  function getMyRole(state: GameState): PlayerRole | 'spectator' {
    if (!myPlayerId) {
      return 'spectator'
    }

    return state.roles[myPlayerId]
  }

  function canControlRole(currentRole: PlayerRole | 'spectator', role: PlayerRole): boolean {
    return currentRole === role || import.meta.env.DEV
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
      currentLevel = selectedLevel

      if (cachedTilesets) {
        currentTilesets = cachedTilesets
        drawLevel(
          levelBackground,
          levelTiles,
          currentTilesets,
          levelPlatforms,
          currentLevel,
          message.gameState.elapsedSeconds,
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
            message.gameState.elapsedSeconds,
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
        message.gameState.elapsedSeconds,
      )
    }
    syncLevelOptions(roomControls.select, currentLevelOptions, currentLevel.id)
    if (previousIsCreator !== isCreator) {
      previousIsCreator = isCreator
      roomControls.select.disabled = !isCreator
    }

    const role = message.playerId
      ? message.gameState.roles[message.playerId]
      : 'spectator'
    const roleHint = getRoleHint(role, message.gameState)
    gameStatus.players.textContent = `${message.connectedCount}/3`
    gameStatus.player.textContent = message.playerId
      ? getPlayerLabel(message.gameState, message.playerId)
      : 'spectator'
    gameStatus.creator.textContent = isCreator ? 'yes' : 'no'
    gameStatus.level.textContent = currentLevel.name
    gameStatus.roles.textContent = getPlayerRolesSummary(message.gameState)
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
    if (message.playerId) {
      const player = message.gameState.players[message.playerId]
      playerRoleBanner.nameInput.style.borderColor = colorToCss(player.color)

      if (document.activeElement !== playerRoleBanner.nameInput) {
        playerRoleBanner.nameInput.value = player.name
        lastSentPlayerName = player.name
      }
    }
    playerRoleBanner.hint.hidden = message.gameState.phase === 'finished'
    playerRoleBanner.hint.textContent = roleHint
    const centerNoticeMessage = getCenterNoticeMessage(message.gameState)
    resetNoticeBanner.element.hidden = centerNoticeMessage === null
    resetNoticeBanner.element.textContent = centerNoticeMessage ?? ''
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

    if (canControlRole(myRole, 'direction') && gameState.phase === 'charging') {
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

    if (canControlRole(myRole, 'power')) {
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

    if (canControlRole(myRole, 'midJump') && keyboard.state.justPressed.has('Space')) {
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
    setFrogFacing(
      frog,
      gameState.phase === 'airborne'
        ? gameState.frog.velocity.x
        : gameState.jumpDirection.x,
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

    powerIndicator.visible = gameState.phase === 'charging'
    if (powerIndicator.visible) {
      drawPowerIndicator(
        powerIndicator,
        frogRenderPosition,
        gameState.jumpDirection,
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

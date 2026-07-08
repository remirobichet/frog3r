import type { Container } from 'pixi.js'
import { AnimatedSprite, Rectangle, Text, Texture } from 'pixi.js'

import { frogRadius } from '@shared/constants/game'
import type { FrogRunState, GameState, PlayerId } from '@shared/types/game-state'

export type FrogAnimation = 'idle' | 'jump' | 'landing'

export interface FrogView {
  sprite: AnimatedSprite
  label: Text
  animation: FrogAnimation
}

export const FROG_FRAME_SIZE = 160
export const FROG_RENDER_SIZE = frogRadius * 4
export const FROG_VISUAL_Y_OFFSET = 24
const FROG_FACING_DEAD_ZONE = 0.01
export const FROG_IDLE_ANIMATION_SPEED = 0.03

const playerOrder: PlayerId[] = [
  'player1',
  'player2',
  'player3',
  'player4',
  'player5',
  'player6',
  'player7',
  'player8',
]

export function createFrogTextures(frogTexture: Texture): Texture[] {
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

export function getFrogAnimation(gameState: FrogRunState): FrogAnimation {
  if (gameState.phase === 'charging' || gameState.phase === 'finished') {
    return 'idle'
  }

  if (gameState.frog.velocity.y < 0) {
    return 'jump'
  }

  return 'landing'
}

export function setFrogAnimation(
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

export function setFrogFacing(
  frog: AnimatedSprite,
  horizontalDirection: number,
): void {
  if (Math.abs(horizontalDirection) <= FROG_FACING_DEAD_ZONE) {
    return
  }

  const horizontalScale = Math.abs(frog.scale.x)
  frog.scale.x = horizontalDirection < 0 ? -horizontalScale : horizontalScale
}

function createFrogView(frogTextures: Texture[]): FrogView {
  const sprite = new AnimatedSprite([frogTextures[0], frogTextures[1]])
  sprite.anchor.set(0.5, 1)
  sprite.animationSpeed = FROG_IDLE_ANIMATION_SPEED
  sprite.width = FROG_RENDER_SIZE
  sprite.height = FROG_RENDER_SIZE
  sprite.play()

  const label = new Text({
    text: '',
    style: {
      align: 'center',
      fill: '#f3fbe8',
      fontFamily: 'Trebuchet MS, Segoe UI, system-ui, sans-serif',
      fontSize: 22,
      fontWeight: '800',
    },
  })
  label.anchor.set(0.5, 1)

  return {
    sprite,
    label,
    animation: 'idle',
  }
}

function destroyFrogView(view: FrogView): void {
  view.sprite.destroy()
  view.label.destroy()
}

function updateFrogView(
  view: FrogView,
  run: FrogRunState,
  frogTextures: Texture[],
  name: string,
  color: number,
  alpha: number,
): void {
  view.sprite.visible = true
  view.sprite.alpha = alpha
  view.sprite.tint = color
  view.sprite.position.set(
    run.frog.position.x,
    run.frog.position.y + FROG_VISUAL_Y_OFFSET,
  )
  view.animation = setFrogAnimation(
    view.sprite,
    frogTextures,
    getFrogAnimation(run),
    view.animation,
  )
  setFrogFacing(
    view.sprite,
    run.phase === 'airborne' ? run.frog.velocity.x : run.jumpDirection.x,
  )

  view.label.text = name
  view.label.alpha = Math.max(alpha, 0.58)
  view.label.tint = color
  view.label.position.set(
    run.frog.position.x,
    run.frog.position.y - FROG_RENDER_SIZE + FROG_VISUAL_Y_OFFSET - 6,
  )
}

export function renderVersusFrogs(
  views: Map<PlayerId, FrogView>,
  container: Container,
  state: GameState,
  myPlayerId: PlayerId | null,
  frogTextures: Texture[],
): void {
  const versus = state.versus
  if (!versus) {
    return
  }

  const activePlayerIds = new Set<PlayerId>()
  const myRun = myPlayerId ? versus.runs[myPlayerId] : null
  const localFinished = Boolean(myRun && myRun.finishedAtSeconds !== null)
  const showAllFrogsNormally = localFinished || versus.status === 'finished'

  for (const playerId of playerOrder) {
    const playerRun = versus.runs[playerId]
    if (!playerRun) {
      continue
    }

    if (
      !state.players[playerId].connected &&
      playerRun.finishedAtSeconds === null
    ) {
      continue
    }

    activePlayerIds.add(playerId)
    let view = views.get(playerId)
    if (!view) {
      view = createFrogView(frogTextures)
      views.set(playerId, view)
      container.addChild(view.sprite, view.label)
    }

    const isLocalPlayer = playerId === myPlayerId
    const alpha = isLocalPlayer || showAllFrogsNormally ? 1 : 0.16
    const player = state.players[playerId]
    updateFrogView(
      view,
      playerRun.run,
      frogTextures,
      player.name,
      player.color,
      alpha,
    )
  }

  for (const [playerId, view] of views) {
    if (activePlayerIds.has(playerId)) {
      continue
    }

    views.delete(playerId)
    destroyFrogView(view)
  }
}

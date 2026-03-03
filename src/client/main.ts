import { Application, Container, Graphics, Text } from 'pixi.js'

import {
  groundY,
  maxJumpPower,
  minJumpPower,
  worldHeight,
  worldWidth,
} from '@shared/constants/game'
import {
  createInitialGameState,
  launchJump,
  simulateTick,
  triggerMidAirJump,
  updateCharge,
  updateDirection,
} from '@shared/utils/gameplay'
import type { PlayerId, Vector2 } from '@shared/types/game-state'

interface KeyboardState {
  pressed: Set<string>
  justPressed: Set<string>
}

interface MouseState {
  x: number
  y: number
  isInsideCanvas: boolean
}

interface PlayerControlScheme {
  chargeKey: string
  miniJumpKey: string
}

const controls: Record<PlayerId, PlayerControlScheme> = {
  player1: {
    chargeKey: 'KeyF',
    miniJumpKey: 'KeyG',
  },
  player2: {
    chargeKey: 'KeyK',
    miniJumpKey: 'KeyL',
  },
}

function getDirectionalVector(mouse: MouseState, frogPosition: Vector2): Vector2 {
  if (!mouse.isInsideCanvas) {
    return { x: 0, y: -1 }
  }

  const x = mouse.x - frogPosition.x
  const y = mouse.y - frogPosition.y
  return { x, y }
}

function setupKeyboard(): KeyboardState {
  const keyboardState: KeyboardState = {
    pressed: new Set<string>(),
    justPressed: new Set<string>(),
  }

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!keyboardState.pressed.has(event.code)) {
      keyboardState.justPressed.add(event.code)
    }
    keyboardState.pressed.add(event.code)
  })
  window.addEventListener('keyup', (event: KeyboardEvent) => {
    keyboardState.pressed.delete(event.code)
  })

  return keyboardState
}

function setupMouse(canvas: HTMLCanvasElement): MouseState {
  const mouseState: MouseState = {
    x: worldWidth / 2,
    y: groundY - 120,
    isInsideCanvas: false,
  }

  canvas.addEventListener('pointermove', (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / bounds.width
    const scaleY = canvas.height / bounds.height

    mouseState.x = (event.clientX - bounds.left) * scaleX
    mouseState.y = (event.clientY - bounds.top) * scaleY
    mouseState.isInsideCanvas = true
  })

  canvas.addEventListener('pointerleave', () => {
    mouseState.isInsideCanvas = false
  })

  return mouseState
}

function findPlayerByRole(
  roles: Record<PlayerId, 'direction' | 'power'>,
  role: 'direction' | 'power',
): PlayerId {
  return roles.player1 === role ? 'player1' : 'player2'
}

async function bootstrap(): Promise<void> {
  const app = new Application()
  await app.init({
    width: worldWidth,
    height: worldHeight,
    background: '#1b3a2f',
    antialias: true,
  })

  const root = document.getElementById('app')
  if (!root) {
    throw new Error('Missing #app mount node')
  }

  root.appendChild(app.canvas)

  const keyboard = setupKeyboard()
  const mouse = setupMouse(app.canvas)
  const stage = new Container()
  app.stage.addChild(stage)

  const ground = new Graphics()
  ground.rect(0, groundY, worldWidth, worldHeight - groundY)
  ground.fill(0x2e5236)
  stage.addChild(ground)

  const frog = new Graphics()
  frog.circle(0, 0, 24)
  frog.fill(0x72be5a)
  stage.addChild(frog)

  const directionLine = new Graphics()
  stage.addChild(directionLine)

  const hud = new Text({
    text: '',
    style: {
      fill: 0xf8f3dd,
      fontSize: 18,
      fontFamily: 'Courier New',
    },
  })
  hud.position.set(12, 12)
  stage.addChild(hud)

  const powerBarBg = new Graphics()
  powerBarBg.roundRect(12, 180, 220, 20, 8)
  powerBarBg.fill(0x0f1a13)
  stage.addChild(powerBarBg)

  const powerBarFill = new Graphics()
  stage.addChild(powerBarFill)

  let gameState = createInitialGameState()
  let wasCharging = false

  app.ticker.add(() => {
    const dtSeconds = app.ticker.deltaMS / 1000
    const directionPlayer = findPlayerByRole(gameState.roles, 'direction')
    const powerPlayer = findPlayerByRole(gameState.roles, 'power')
    const directionInput = getDirectionalVector(mouse, gameState.frog.position)
    const powerMapping = controls[powerPlayer]

    const isCharging = keyboard.pressed.has(powerMapping.chargeKey)

    gameState = updateDirection(gameState, directionInput)
    gameState = updateCharge(gameState, dtSeconds, isCharging)

    if (wasCharging && !isCharging && gameState.phase === 'charging') {
      gameState = launchJump(gameState)
    }
    wasCharging = isCharging

    if (keyboard.justPressed.has(powerMapping.miniJumpKey)) {
      gameState = triggerMidAirJump(gameState)
    }

    gameState = simulateTick(gameState, dtSeconds)

    frog.position.set(gameState.frog.position.x, gameState.frog.position.y)

    directionLine.clear()
    directionLine.moveTo(gameState.frog.position.x, gameState.frog.position.y)
    directionLine.lineTo(
      gameState.frog.position.x + (gameState.jumpDirection.x * 48),
      gameState.frog.position.y + (gameState.jumpDirection.y * 48),
    )
    directionLine.stroke({ color: 0x101911, width: 3 })

    const powerRatio = (gameState.jumpPower - minJumpPower) / (maxJumpPower - minJumpPower)
    const clampedPowerRatio = Math.max(0, Math.min(1, powerRatio))
    powerBarFill.clear()
    powerBarFill.roundRect(14, 182, 216 * clampedPowerRatio, 16, 6)
    powerBarFill.fill(0x7bdc67)

    hud.text = [
      `Phase: ${gameState.phase}`,
      `Jumps: ${gameState.jumpCount}`,
      `Power: ${Math.round(gameState.jumpPower)}`,
      `P1 role: ${gameState.roles.player1} | P2 role: ${gameState.roles.player2}`,
      'Direction: Mouse cursor',
      `Power Player: ${powerPlayer} (Hold F or K, mini jump G or L)`,
      `Mid-air used: ${gameState.midAirJumpUsed ? 'yes' : 'no'}`,
    ].join('\n')

    keyboard.justPressed.clear()
  })
}

bootstrap().catch((error: unknown) => {
  console.error('Client bootstrap failed', error)
})

import { Application, Container, Graphics, Text } from 'pixi.js'

import { groundY, worldHeight, worldWidth } from '@shared/constants/game'
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

interface PlayerControlScheme {
  direction: {
    up: string
    down: string
    left: string
    right: string
  }
  chargeKey: string
  miniJumpKey: string
}

const controls: Record<PlayerId, PlayerControlScheme> = {
  player1: {
    direction: {
      up: 'KeyW',
      down: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
    },
    chargeKey: 'KeyF',
    miniJumpKey: 'KeyG',
  },
  player2: {
    direction: {
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    },
    chargeKey: 'KeyK',
    miniJumpKey: 'KeyL',
  },
}

function getDirectionalVector(keys: KeyboardState, playerId: PlayerId): Vector2 {
  const mapping = controls[playerId].direction
  const x = (keys.pressed.has(mapping.right) ? 1 : 0) - (keys.pressed.has(mapping.left) ? 1 : 0)
  const y = (keys.pressed.has(mapping.down) ? 1 : 0) - (keys.pressed.has(mapping.up) ? 1 : 0)
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

  let gameState = createInitialGameState()
  let wasCharging = false

  app.ticker.add(() => {
    const dtSeconds = app.ticker.deltaMS / 1000
    const directionPlayer = findPlayerByRole(gameState.roles, 'direction')
    const powerPlayer = findPlayerByRole(gameState.roles, 'power')
    const directionInput = getDirectionalVector(keyboard, directionPlayer)
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

    hud.text = [
      `Phase: ${gameState.phase}`,
      `Jumps: ${gameState.jumpCount}`,
      `Power: ${Math.round(gameState.jumpPower)}`,
      `P1 role: ${gameState.roles.player1} | P2 role: ${gameState.roles.player2}`,
      `Direction Player: ${directionPlayer} (WASD/Arrows)`,
      `Power Player: ${powerPlayer} (Hold F or K, mini jump G or L)`,
      `Mid-air used: ${gameState.midAirJumpUsed ? 'yes' : 'no'}`,
    ].join('\n')

    keyboard.justPressed.clear()
  })
}

bootstrap().catch((error: unknown) => {
  console.error('Client bootstrap failed', error)
})

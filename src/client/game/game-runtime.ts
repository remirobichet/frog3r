import type { Room } from 'colyseus.js'
import { Application, Container, Graphics, Text } from 'pixi.js'

import {
  groundY,
  maxJumpPower,
  minJumpPower,
  worldHeight,
  worldWidth,
} from '@shared/constants/game'
import type { GameState, PlayerId, Vector2 } from '@shared/types/game-state'
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

function setupMouse(canvas: HTMLCanvasElement): MouseSetup {
  const state: MouseState = {
    x: worldWidth / 2,
    y: groundY - 120,
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

function getDirectionalVector(mouse: MouseState, frogPosition: Vector2): Vector2 {
  if (!mouse.isInsideCanvas) {
    return { x: 0, y: -1 }
  }

  return {
    x: mouse.x - frogPosition.x,
    y: mouse.y - frogPosition.y,
  }
}

export async function startGameRuntime(params: StartGameRuntimeParams): Promise<GameRuntime> {
  const app = new Application()
  await app.init({
    width: worldWidth,
    height: worldHeight,
    background: '#1b3a2f',
    antialias: true,
  })

  params.root.appendChild(app.canvas)

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
    text: 'Waiting for room state...',
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

  let latestState: GameState | null = null
  let myPlayerId: PlayerId | null = null
  let connectedCount = 0
  let myInviteCode = params.inviteCode
  let chargingSent = false
  let lastAimSendAt = 0

  function getMyRole(state: GameState): 'direction' | 'power' | 'spectator' {
    if (!myPlayerId) {
      return 'spectator'
    }

    return state.roles[myPlayerId]
  }

  function sendInput(input: ClientInputMessage): void {
    params.room.send('input', input)
  }

  params.room.onMessage('joined', (message: JoinedMessage) => {
    myPlayerId = message.playerId
    myInviteCode = message.inviteCode
  })

  params.room.onMessage('state', (message: StateMessage) => {
    latestState = message.gameState
    connectedCount = message.connectedCount
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

    if (myRole === 'direction' && gameState.phase === 'charging') {
      if (now - lastAimSendAt >= 50) {
        const directionInput = getDirectionalVector(mouse.state, gameState.frog.position)
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

      if (keyboard.state.justPressed.has('KeyE')) {
        sendInput({
          type: 'miniJump',
        })
      }
    } else if (chargingSent) {
      sendInput({
        type: 'charge',
        active: false,
      })
      chargingSent = false
    }

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

    const roleText = myRole === 'spectator' ? 'spectator' : myRole
    hud.text = [
      `Room: ${myInviteCode || '-'} | Players: ${connectedCount}/2`,
      `You: ${myPlayerId ?? '-'} | Role: ${roleText}`,
      `Phase: ${gameState.phase} | Jumps: ${gameState.jumpCount}`,
      `Power: ${Math.round(gameState.jumpPower)} | Mid-air used: ${gameState.midAirJumpUsed ? 'yes' : 'no'}`,
      'Controls: mouse aim (direction role), hold SPACE (power role), E mini jump',
    ].join('\n')

    keyboard.state.justPressed.clear()
  })

  return {
    destroy: () => {
      keyboard.destroy()
      mouse.destroy()
      app.destroy(undefined, { children: true })
      if (app.canvas.parentElement === params.root) {
        params.root.removeChild(app.canvas)
      }
    },
    getInviteCode: () => myInviteCode,
  }
}

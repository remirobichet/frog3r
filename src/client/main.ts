import { Client } from 'colyseus.js'
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

interface CreateRoomResponse {
  inviteCode: string
  roomId: string
  inviteLink: string
}

interface JoinRoomResponse {
  inviteCode: string
  roomId: string
}

interface LobbyElements {
  wrapper: HTMLDivElement
  title: HTMLHeadingElement
  subtitle: HTMLParagraphElement
  codeInput: HTMLInputElement
  createButton: HTMLButtonElement
  joinButton: HTMLButtonElement
  copyButton: HTMLButtonElement
  status: HTMLParagraphElement
}

function setupKeyboard(): KeyboardState {
  const keyboardState: KeyboardState = {
    pressed: new Set<string>(),
    justPressed: new Set<string>(),
  }

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      event.preventDefault()
    }

    if (!keyboardState.pressed.has(event.code)) {
      keyboardState.justPressed.add(event.code)
    }
    keyboardState.pressed.add(event.code)
  })
  window.addEventListener('keyup', (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      event.preventDefault()
    }

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

function getDirectionalVector(mouse: MouseState, frogPosition: Vector2): Vector2 {
  if (!mouse.isInsideCanvas) {
    return { x: 0, y: -1 }
  }

  return {
    x: mouse.x - frogPosition.x,
    y: mouse.y - frogPosition.y,
  }
}

function getServerHttpBase(): string {
  const host = window.location.hostname || 'localhost'
  return `${window.location.protocol}//${host}:2567`
}

function getServerWsBase(): string {
  const host = window.location.hostname || 'localhost'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${host}:2567`
}

function createLobby(root: HTMLElement): LobbyElements {
  root.style.position = 'relative'

  const wrapper = document.createElement('div')
  wrapper.style.position = 'absolute'
  wrapper.style.top = '16px'
  wrapper.style.right = '16px'
  wrapper.style.width = '320px'
  wrapper.style.padding = '14px'
  wrapper.style.background = 'rgba(10, 21, 15, 0.85)'
  wrapper.style.border = '1px solid rgba(143, 201, 126, 0.5)'
  wrapper.style.borderRadius = '10px'
  wrapper.style.backdropFilter = 'blur(4px)'
  wrapper.style.zIndex = '10'
  wrapper.style.fontFamily = 'monospace'
  wrapper.style.color = '#eef9e8'

  const title = document.createElement('h2')
  title.textContent = 'Dual Mind Frog'
  title.style.margin = '0 0 8px 0'
  title.style.fontSize = '20px'

  const subtitle = document.createElement('p')
  subtitle.textContent = 'Create or join an invite game.'
  subtitle.style.margin = '0 0 12px 0'
  subtitle.style.opacity = '0.9'

  const codeInput = document.createElement('input')
  codeInput.placeholder = 'Invite code'
  codeInput.autocomplete = 'off'
  codeInput.style.width = '100%'
  codeInput.style.boxSizing = 'border-box'
  codeInput.style.marginBottom = '10px'
  codeInput.style.padding = '8px'
  codeInput.style.borderRadius = '8px'
  codeInput.style.border = '1px solid rgba(143, 201, 126, 0.5)'
  codeInput.style.background = 'rgba(255, 255, 255, 0.08)'
  codeInput.style.color = '#eef9e8'

  const createButton = document.createElement('button')
  createButton.textContent = 'Create Game'
  createButton.style.width = '100%'
  createButton.style.padding = '10px'
  createButton.style.marginBottom = '8px'

  const joinButton = document.createElement('button')
  joinButton.textContent = 'Join Game'
  joinButton.style.width = '100%'
  joinButton.style.padding = '10px'
  joinButton.style.marginBottom = '8px'

  const copyButton = document.createElement('button')
  copyButton.textContent = 'Copy Invite Link'
  copyButton.style.width = '100%'
  copyButton.style.padding = '10px'
  copyButton.style.display = 'none'

  const status = document.createElement('p')
  status.textContent = 'Idle'
  status.style.margin = '10px 0 0 0'
  status.style.minHeight = '40px'

  wrapper.appendChild(title)
  wrapper.appendChild(subtitle)
  wrapper.appendChild(codeInput)
  wrapper.appendChild(createButton)
  wrapper.appendChild(joinButton)
  wrapper.appendChild(copyButton)
  wrapper.appendChild(status)
  root.appendChild(wrapper)

  return {
    wrapper,
    title,
    subtitle,
    codeInput,
    createButton,
    joinButton,
    copyButton,
    status,
  }
}

async function createRoom(httpBase: string): Promise<CreateRoomResponse> {
  const response = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  if (!response.ok) {
    throw new Error('Unable to create room')
  }

  return response.json() as Promise<CreateRoomResponse>
}

async function joinByInviteCode(httpBase: string, inviteCode: string): Promise<JoinRoomResponse> {
  const response = await fetch(`${httpBase}/api/rooms/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inviteCode }),
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Invite code not found')
    }

    if (response.status === 409) {
      throw new Error('Room is full')
    }

    throw new Error('Unable to join room')
  }

  return response.json() as Promise<JoinRoomResponse>
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

  const lobby = createLobby(root)
  const httpBase = getServerHttpBase()
  const wsBase = getServerWsBase()
  const client = new Client(wsBase)

  let inviteLink = ''
  let currentRoom: Room | null = null
  let latestState: GameState | null = null
  let myPlayerId: PlayerId | null = null
  let connectedCount = 0
  let myInviteCode = ''
  let chargingSent = false
  let lastAimSendAt = 0

  function setStatus(text: string): void {
    lobby.status.textContent = text
  }

  function setLobbyBusy(isBusy: boolean): void {
    lobby.createButton.disabled = isBusy
    lobby.joinButton.disabled = isBusy
    lobby.codeInput.disabled = isBusy
  }

  function getMyRole(state: GameState): 'direction' | 'power' | 'spectator' {
    if (!myPlayerId) {
      return 'spectator'
    }

    return state.roles[myPlayerId]
  }

  function sendInput(input: ClientInputMessage): void {
    if (!currentRoom) {
      return
    }

    currentRoom.send('input', input)
  }

  async function connectToRoom(roomId: string, inviteCode: string): Promise<void> {
    if (currentRoom) {
      await currentRoom.leave()
      currentRoom = null
    }

    setStatus('Connecting...')
    const room = await client.joinById(roomId)
    currentRoom = room
    myInviteCode = inviteCode
    chargingSent = false
    lastAimSendAt = 0

    room.onMessage('joined', (message: JoinedMessage) => {
      myPlayerId = message.playerId
      myInviteCode = message.inviteCode
      setStatus(`Connected as ${message.playerId}. Invite: ${message.inviteCode}`)
    })

    room.onMessage('state', (message: StateMessage) => {
      latestState = message.gameState
      connectedCount = message.connectedCount
    })

    room.onLeave(() => {
      setStatus('Disconnected from room')
      lobby.wrapper.style.display = 'block'
      currentRoom = null
      myPlayerId = null
      latestState = null
    })

    lobby.wrapper.style.display = 'none'
  }

  async function handleCreate(): Promise<void> {
    setLobbyBusy(true)
    try {
      const room = await createRoom(httpBase)
      inviteLink = room.inviteLink
      lobby.codeInput.value = room.inviteCode
      lobby.copyButton.style.display = 'block'
      setStatus(`Room ${room.inviteCode} created. Share invite link.`)
      await connectToRoom(room.roomId, room.inviteCode)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Create room failed'
      setStatus(message)
    } finally {
      setLobbyBusy(false)
    }
  }

  async function handleJoin(codeValue: string): Promise<void> {
    const inviteCode = codeValue.trim().toUpperCase()
    if (!inviteCode) {
      setStatus('Enter an invite code')
      return
    }

    setLobbyBusy(true)
    try {
      const room = await joinByInviteCode(httpBase, inviteCode)
      inviteLink = `${window.location.origin}/?room=${inviteCode}`
      lobby.copyButton.style.display = 'block'
      await connectToRoom(room.roomId, inviteCode)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Join room failed'
      setStatus(message)
    } finally {
      setLobbyBusy(false)
    }
  }

  lobby.createButton.addEventListener('click', () => {
    void handleCreate()
  })

  lobby.joinButton.addEventListener('click', () => {
    void handleJoin(lobby.codeInput.value)
  })

  lobby.copyButton.addEventListener('click', async () => {
    const link = inviteLink || `${window.location.origin}/?room=${myInviteCode}`
    await navigator.clipboard.writeText(link)
    setStatus(`Invite copied: ${link}`)
  })

  const roomFromUrl = new URLSearchParams(window.location.search).get('room')
  if (roomFromUrl) {
    lobby.codeInput.value = roomFromUrl.toUpperCase()
    setStatus(`Auto-join ${roomFromUrl.toUpperCase()}...`)
    void handleJoin(roomFromUrl)
  }

  app.ticker.add(() => {
    const gameState = latestState
    if (!gameState) {
      keyboard.justPressed.clear()
      return
    }

    const myRole = getMyRole(gameState)
    const now = performance.now()

    if (myRole === 'direction' && gameState.phase === 'charging') {
      if (now - lastAimSendAt >= 50) {
        const directionInput = getDirectionalVector(mouse, gameState.frog.position)
        sendInput({
          type: 'aim',
          direction: directionInput,
        })
        lastAimSendAt = now
      }
    }

    if (myRole === 'power') {
      const charging = keyboard.pressed.has('Space')
      if (charging !== chargingSent) {
        sendInput({
          type: 'charge',
          active: charging,
        })
        chargingSent = charging
      }

      if (keyboard.justPressed.has('KeyE')) {
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

    keyboard.justPressed.clear()
  })
}

bootstrap().catch((error: unknown) => {
  console.error('Client bootstrap failed', error)
})

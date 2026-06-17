import { Client } from 'colyseus.js'
import type { Room } from 'colyseus.js'

import { startGameRuntime, type GameRuntime } from '@client/game/game-runtime'
import {
  createRoom,
  getServerHttpBase,
  getServerWsBase,
  joinByInviteCode,
} from '@client/network/lobby-api'
import { createLobbyPage } from '@client/ui/lobby-page'

async function bootstrap(): Promise<void> {
  const gameRoot = document.getElementById('game-root')
  if (!(gameRoot instanceof HTMLElement)) {
    throw new Error('Missing #game-root mount node')
  }

  const copyInviteInGameButtonElement =
    document.getElementById('copy-invite-ingame')
  if (!(copyInviteInGameButtonElement instanceof HTMLButtonElement)) {
    throw new Error('Missing #copy-invite-ingame button')
  }

  const gameRootElement: HTMLElement = gameRoot
  const copyInviteInGameButton: HTMLButtonElement =
    copyInviteInGameButtonElement

  const lobby = createLobbyPage()
  const httpBase = getServerHttpBase()
  const wsBase = getServerWsBase()
  const client = new Client(wsBase)

  let inviteLink = ''
  let currentRoom: Room | null = null
  let gameRuntime: GameRuntime | null = null
  let copyButtonResetTimeout: number | null = null

  function resetCopyInviteButtonLabel(): void {
    copyInviteInGameButton.textContent = '📋'
  }

  function showInviteCopiedFeedback(): void {
    resetCopyInviteButtonLabel()

    if (copyButtonResetTimeout !== null) {
      window.clearTimeout(copyButtonResetTimeout)
    }

    copyInviteInGameButton.textContent = '✅'
    copyButtonResetTimeout = window.setTimeout(() => {
      resetCopyInviteButtonLabel()
      copyButtonResetTimeout = null
    }, 1500)
  }

  async function teardownGame(): Promise<void> {
    gameRuntime?.destroy()
    gameRuntime = null
    copyInviteInGameButton.hidden = true

    if (copyButtonResetTimeout !== null) {
      window.clearTimeout(copyButtonResetTimeout)
      copyButtonResetTimeout = null
    }

    resetCopyInviteButtonLabel()

    if (currentRoom) {
      await currentRoom.leave()
      currentRoom = null
    }
  }

  async function connectToRoom(
    roomId: string,
    inviteCode: string,
  ): Promise<void> {
    await teardownGame()

    lobby.setStatus('Connecting...')
    const room = await client.joinById(roomId)
    currentRoom = room

    gameRuntime = await startGameRuntime({
      root: gameRootElement,
      room,
      inviteCode,
      onDisconnect: () => {
        void teardownGame()
        gameRootElement.style.display = 'none'
        lobby.show()
        lobby.setStatus('Disconnected from room')
      },
    })

    lobby.hide()
    gameRootElement.style.display = 'flex'
  }

  async function handleCreate(): Promise<void> {
    lobby.setBusy(true)

    try {
      const room = await createRoom(httpBase)
      inviteLink = room.inviteLink
      lobby.setInviteCode(room.inviteCode)
      lobby.setCopyVisible(true)
      lobby.setStatus(`Room ${room.inviteCode} created. Share invite link.`)
      await connectToRoom(room.roomId, room.inviteCode)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Create room failed'
      lobby.setStatus(message)
    } finally {
      lobby.setBusy(false)
    }
  }

  async function handleJoin(codeValue: string): Promise<void> {
    const inviteCode = codeValue.trim().toUpperCase()
    if (!inviteCode) {
      lobby.setStatus('Enter an invite code')
      return
    }

    lobby.setBusy(true)

    try {
      const room = await joinByInviteCode(httpBase, inviteCode)
      inviteLink = `${window.location.origin}/?room=${inviteCode}`
      lobby.setCopyVisible(true)
      await connectToRoom(room.roomId, inviteCode)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Join room failed'
      lobby.setStatus(message)
    } finally {
      lobby.setBusy(false)
    }
  }

  lobby.onCreate(() => {
    void handleCreate()
  })

  lobby.onJoin((inviteCode: string) => {
    void handleJoin(inviteCode)
  })

  lobby.onCopyInvite(async () => {
    const activeInviteCode =
      gameRuntime?.getInviteCode() || lobby.getInviteCode().trim().toUpperCase()
    const link =
      inviteLink || `${window.location.origin}/?room=${activeInviteCode}`

    await navigator.clipboard.writeText(link)
    lobby.setStatus(`Invite copied: ${link}`)
    showInviteCopiedFeedback()
  })

  copyInviteInGameButton.addEventListener('click', async () => {
    const activeInviteCode =
      gameRuntime?.getInviteCode() || lobby.getInviteCode().trim().toUpperCase()
    const link =
      inviteLink || `${window.location.origin}/?room=${activeInviteCode}`

    await navigator.clipboard.writeText(link)
    showInviteCopiedFeedback()
  })

  const roomFromUrl = new URLSearchParams(window.location.search).get('room')
  if (roomFromUrl) {
    const inviteCode = roomFromUrl.trim().toUpperCase()
    lobby.setInviteCode(inviteCode)
    lobby.setStatus(`Auto-join ${inviteCode}...`)
    void handleJoin(inviteCode)
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Client bootstrap failed', error)
})

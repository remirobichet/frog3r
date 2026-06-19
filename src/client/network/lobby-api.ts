import type { GameMode } from '@shared/types/game-state'

export interface CreateRoomResponse {
  inviteCode: string
  mode: GameMode
  roomId: string
  inviteLink: string
}

export interface JoinRoomResponse {
  inviteCode: string
  mode: GameMode
  roomId: string
}

export function getServerHttpBase(): string {
  if (import.meta.env.DEV) {
    const host = window.location.hostname || 'localhost'
    return `${window.location.protocol}//${host}:2567`
  }

  return window.location.origin
}

export function getServerWsBase(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  if (import.meta.env.DEV) {
    const host = window.location.hostname || 'localhost'
    return `${protocol}//${host}:2567`
  }

  return `${protocol}//${window.location.host}`
}

export async function createRoom(
  httpBase: string,
  mode: GameMode,
): Promise<CreateRoomResponse> {
  const response = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode }),
  })

  if (!response.ok) {
    throw new Error('Unable to create room')
  }

  return response.json() as Promise<CreateRoomResponse>
}

export async function joinByInviteCode(
  httpBase: string,
  inviteCode: string,
): Promise<JoinRoomResponse> {
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

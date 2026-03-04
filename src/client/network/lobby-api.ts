export interface CreateRoomResponse {
  inviteCode: string
  roomId: string
  inviteLink: string
}

export interface JoinRoomResponse {
  inviteCode: string
  roomId: string
}

export function getServerHttpBase(): string {
  const host = window.location.hostname || 'localhost'
  return `${window.location.protocol}//${host}:2567`
}

export function getServerWsBase(): string {
  const host = window.location.hostname || 'localhost'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${host}:2567`
}

export async function createRoom(httpBase: string): Promise<CreateRoomResponse> {
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

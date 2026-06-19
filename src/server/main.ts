import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { matchMaker, Server } from 'colyseus'
import cors from 'cors'
import express, { type Request, type Response } from 'express'

import { gameRoomName } from '../shared/constants/game'
import type { GameMode } from '../shared/types/game-state'

import { GameRoom } from './rooms/game-room'

const port = Number(process.env.PORT ?? 2567)
const host = process.env.HOST ?? '0.0.0.0'
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const clientDistDirectory = path.resolve(process.cwd(), 'dist')
const clientIndexPath = path.join(clientDistDirectory, 'index.html')

function createInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

function parseGameMode(value: unknown): GameMode {
  return value === 'versus' ? 'versus' : 'coop'
}

async function startServer(): Promise<void> {
  const app = express()
  app.use(cors())
  app.use(express.json())

  const httpServer = http.createServer(app)
  const gameServer = new Server({
    server: httpServer,
  })
  gameServer.define(gameRoomName, GameRoom)

  app.get('/api/health', (_request: Request, response: Response) => {
    response.json({ ok: true })
  })

  app.post('/api/rooms', async (request: Request, response: Response) => {
    const existingCode = typeof request.body?.inviteCode === 'string'
      ? request.body.inviteCode.trim().toUpperCase()
      : ''
    const inviteCode = existingCode || createInviteCode()
    const mode = parseGameMode(request.body?.mode)

    const room = await matchMaker.createRoom(gameRoomName, {
      inviteCode,
      mode,
    })

    const baseUrl = request.headers.origin ?? 'http://localhost:5173'
    response.status(201).json({
      inviteCode,
      mode,
      roomId: room.roomId,
      inviteLink: `${baseUrl}/?room=${inviteCode}`,
    })
  })

  app.post('/api/rooms/join', async (request: Request, response: Response) => {
    const inviteCode = String(request.body?.inviteCode ?? '').trim().toUpperCase()
    if (!inviteCode) {
      response.status(400).json({ error: 'Missing invite code' })
      return
    }

    const rooms = await matchMaker.query({
      name: gameRoomName,
    })

    const targetRoom = rooms.find((room) => {
      const metadata = room.metadata as { inviteCode?: string } | undefined
      return metadata?.inviteCode === inviteCode
    })

    if (!targetRoom) {
      response.status(404).json({ error: 'Room not found' })
      return
    }

    const metadata = targetRoom.metadata as
      | { mode?: GameMode; maxClients?: number }
      | undefined
    const maxClients = metadata?.maxClients ?? 3

    if (targetRoom.locked || targetRoom.clients >= maxClients) {
      response.status(409).json({ error: 'Room is full' })
      return
    }

    response.json({
      inviteCode,
      mode: metadata?.mode ?? 'coop',
      roomId: targetRoom.roomId,
    })
  })

  app.use(express.static(clientDistDirectory))

  app.get('*', (request: Request, response: Response) => {
    if (request.path.startsWith('/api/')) {
      response.status(404).json({ error: 'Not found' })
      return
    }

    response.sendFile(clientIndexPath)
  })

  await gameServer.listen(port)
  console.log(`Colyseus server running on ws://${host}:${port}`)
  console.log(`Matchmaking API on http://${host}:${port}/api/rooms`)
}

startServer().catch((error: unknown) => {
  console.error('Failed to start server', error)
  process.exit(1)
})

import { gameRoomName } from '@shared/constants/game'
import { createInitialGameState } from '@shared/utils/gameplay'

import { GameRoom } from './rooms/game-room'

function startServer(): void {
  const room = new GameRoom(createInitialGameState())
  setInterval(() => {
    room.tick(1 / 60)
  }, 1000 / 60)

  console.log(`Server placeholder started for room: ${gameRoomName}`)
}

startServer()

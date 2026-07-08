import type { PlayerId, Vector2 } from '../../shared/types/game-state'
import type { ClientInputMessage } from '../../shared/types/network'

interface InputRouteHandlers {
  selectLevel: (levelId: string) => void
  aim: (playerId: PlayerId, direction: Vector2) => void
  charge: (playerId: PlayerId, active: boolean) => void
  setName: (playerId: PlayerId, name: string) => void
  ping: (playerId: PlayerId, position: Vector2) => void
  debugTeleport: (playerId: PlayerId, position: Vector2) => void
  miniJump: (playerId: PlayerId) => void
}

interface RouteClientInputParams {
  clientSessionId: string
  playerId: PlayerId | undefined
  creatorSessionId: string | null
  input: ClientInputMessage
  allowDevelopmentInputs: boolean
  handlers: InputRouteHandlers
}

export function routeClientInput(params: RouteClientInputParams): boolean {
  const { input, playerId, handlers } = params

  if (input.type === 'selectLevel') {
    if (params.clientSessionId !== params.creatorSessionId) {
      return false
    }

    handlers.selectLevel(input.levelId)
    return true
  }

  if (!playerId) {
    return false
  }

  switch (input.type) {
    case 'aim':
      handlers.aim(playerId, input.direction)
      return false
    case 'charge':
      handlers.charge(playerId, input.active)
      return false
    case 'setName':
      handlers.setName(playerId, input.name)
      return true
    case 'ping':
      handlers.ping(playerId, input.position)
      return true
    case 'debugTeleport':
      if (!params.allowDevelopmentInputs) {
        return false
      }

      handlers.debugTeleport(playerId, input.position)
      return true
    case 'miniJump':
      handlers.miniJump(playerId)
      return false
  }
}

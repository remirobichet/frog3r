import type { CoopPlayerId, PlayerRole } from '@shared/types/game-state'

export function rotateRoles(
  roles: Record<CoopPlayerId, PlayerRole>,
): Record<CoopPlayerId, PlayerRole> {
  return {
    player1:
      roles.player1 === 'direction'
        ? 'power'
        : roles.player1 === 'power'
          ? 'midJump'
          : 'direction',
    player2:
      roles.player2 === 'direction'
        ? 'power'
        : roles.player2 === 'power'
          ? 'midJump'
          : 'direction',
    player3:
      roles.player3 === 'direction'
        ? 'power'
        : roles.player3 === 'power'
          ? 'midJump'
          : 'direction',
  }
}

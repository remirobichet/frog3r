import type {
  CoopPlayerId,
  GameState,
  PlayerId,
  PlayerRole,
} from '@shared/types/game-state'
import type { LevelSummary } from '@shared/types/level'

export interface RoomControls {
  panel: HTMLDivElement
  copyInviteButton: HTMLButtonElement
  roomCode: HTMLSpanElement
  select: HTMLSelectElement
}

export interface GameStatusPanel {
  panel: HTMLDetailsElement
  players: HTMLSpanElement
  player: HTMLSpanElement
  creator: HTMLSpanElement
  mode: HTMLSpanElement
  level: HTMLSpanElement
  roles: HTMLSpanElement
  phase: HTMLSpanElement
  jumps: HTMLSpanElement
  power: HTMLSpanElement
  midAir: HTMLSpanElement
  controls: HTMLSpanElement
}

export interface PlayerRoleBanner {
  value: HTMLSpanElement
  hint: HTMLParagraphElement
  nameInput: HTMLInputElement
}

export interface ResetNoticeBanner {
  element: HTMLParagraphElement
}

export type PlayerControlRole = PlayerRole | 'runner' | 'spectator'

const PING_LIFETIME_SECONDS = 2
const playerOrder: PlayerId[] = [
  'player1',
  'player2',
  'player3',
  'player4',
  'player5',
  'player6',
  'player7',
  'player8',
]

function mustGetElementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element #${id}`)
  }

  return element as T
}

export function getRoomControls(): RoomControls {
  return {
    panel: mustGetElementById<HTMLDivElement>('room-controls'),
    copyInviteButton:
      mustGetElementById<HTMLButtonElement>('copy-invite-ingame'),
    roomCode: mustGetElementById<HTMLSpanElement>('room-code'),
    select: mustGetElementById<HTMLSelectElement>('level-select'),
  }
}

export function getGameStatusPanel(): GameStatusPanel {
  return {
    panel: mustGetElementById<HTMLDetailsElement>('game-status'),
    players: mustGetElementById<HTMLSpanElement>('status-players'),
    player: mustGetElementById<HTMLSpanElement>('status-player'),
    creator: mustGetElementById<HTMLSpanElement>('status-creator'),
    mode: mustGetElementById<HTMLSpanElement>('status-mode'),
    level: mustGetElementById<HTMLSpanElement>('status-level'),
    roles: mustGetElementById<HTMLSpanElement>('status-roles'),
    phase: mustGetElementById<HTMLSpanElement>('status-phase'),
    jumps: mustGetElementById<HTMLSpanElement>('status-jumps'),
    power: mustGetElementById<HTMLSpanElement>('status-power'),
    midAir: mustGetElementById<HTMLSpanElement>('status-midair'),
    controls: mustGetElementById<HTMLSpanElement>('status-controls'),
  }
}

export function getPlayerRoleBanner(): PlayerRoleBanner {
  return {
    value: mustGetElementById<HTMLSpanElement>('player-role-value'),
    hint: mustGetElementById<HTMLParagraphElement>('player-control-hint'),
    nameInput: mustGetElementById<HTMLInputElement>('player-name-input'),
  }
}

export function getResetNoticeBanner(): ResetNoticeBanner {
  return {
    element: mustGetElementById<HTMLParagraphElement>('reset-notice'),
  }
}

export function syncLevelOptions(
  select: HTMLSelectElement,
  levels: LevelSummary[],
  selectedLevelId: string,
): void {
  const nextSignature = levels
    .map((level) => `${level.id}:${level.name}`)
    .join('|')
  if (select.dataset.optionsSignature !== nextSignature) {
    select.replaceChildren(
      ...levels.map((level) => {
        const option = document.createElement('option')
        option.value = level.id
        option.textContent = level.name
        return option
      }),
    )
    select.dataset.optionsSignature = nextSignature
  }

  if (select.value !== selectedLevelId) {
    select.value = selectedLevelId
  }
}

export function getRoleDisplayName(role: PlayerControlRole): string {
  if (role === 'runner') {
    return 'Runner'
  }

  if (role === 'direction') {
    return 'Aim'
  }

  if (role === 'power') {
    return 'Charge'
  }

  if (role === 'midJump') {
    return 'Mid-jump'
  }

  return 'Spectator'
}

export function getRoleHint(
  role: PlayerControlRole,
  state: GameState,
  playerId: PlayerId | null,
): string {
  if (state.mode === 'versus') {
    if (role === 'spectator' || !playerId) {
      return 'You are watching this race.'
    }

    const playerRun = state.versus?.runs[playerId]
    if (state.versus?.status === 'finished') {
      return 'Race finished. Check the final recap.'
    }

    if (playerRun && playerRun.finishedAtSeconds !== null) {
      return 'Finished. Watch the remaining frogs reach the goal.'
    }

    return 'Aim with your cursor. Hold Space to charge, release to jump, then press Space in air.'
  }

  if (state.phase === 'finished') {
    const jumps = state.finishedAtJumpCount ?? state.jumpCount
    const jumpLabel = jumps === 1 ? 'jump' : 'jumps'
    return `Finish reached in ${jumps} ${jumpLabel}. Change level to run again.`
  }

  if (role === 'direction') {
    return state.phase === 'charging'
      ? 'Guide the arc with your cursor before your teammate releases.'
      : 'The frog is airborne. Watch the landing and prepare for the next aim.'
  }

  if (role === 'power') {
    return state.phase === 'charging'
      ? 'Hold Space to build power, then release to launch.'
      : 'Launch committed. Wait for the landing to receive your next role.'
  }

  if (role === 'midJump') {
    if (state.phase === 'airborne' && !state.midAirJumpUsed) {
      return 'Press Space at the right moment for the second jump.'
    }

    return 'Save your timing for the airborne second jump.'
  }

  return 'You are watching this run. Join with an open player slot to take a role.'
}

function formatRaceTime(seconds: number): string {
  return `${seconds.toFixed(2)}s`
}

function getJumpLabel(jumps: number): string {
  return jumps === 1 ? 'jump' : 'jumps'
}

function getRankLabel(rank: number): string {
  if (rank === 1) {
    return '🥇'
  }

  if (rank === 2) {
    return '🥈'
  }

  if (rank === 3) {
    return '🥉'
  }

  return `${rank}.`
}

export function getCenterNoticeMessage(
  state: GameState,
  playerId: PlayerId | null,
): string | null {
  if (state.mode === 'versus' && state.versus?.status === 'finished') {
    const winner = state.versus.winnerPlayerId
      ? state.players[state.versus.winnerPlayerId]
      : null
    const resultLines = state.versus.results.map((result) => {
      const jumpLabel = getJumpLabel(result.jumpCount)
      return `${getRankLabel(result.rank)} ${result.name} - ${formatRaceTime(result.finishedAtSeconds)} - ${result.jumpCount} ${jumpLabel}`
    })

    return [`👑 Winner: ${winner?.name ?? 'Unknown'}`, '', ...resultLines].join(
      '\n',
    )
  }

  if (state.mode === 'versus') {
    const playerRun = playerId ? state.versus?.runs[playerId]?.run : null
    if (playerRun?.resetNotice) {
      return playerRun.resetNotice.message
    }

    if (playerRun?.phase === 'finished') {
      return 'Finished! Waiting for the remaining frogs.'
    }
  }

  if (state.resetNotice) {
    return state.resetNotice.message
  }

  if (state.phase === 'finished') {
    const jumps = state.finishedAtJumpCount ?? state.jumpCount
    const jumpLabel = jumps === 1 ? 'jump' : 'jumps'
    return `You won in ${jumps} ${jumpLabel}!`
  }

  return null
}

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function getPlayerLabel(state: GameState, playerId: PlayerId): string {
  return state.players[playerId].name
}

export function getPlayerRolesSummary(state: GameState): string {
  return (['player1', 'player2', 'player3'] as CoopPlayerId[])
    .map((playerId) => {
      const player = state.players[playerId]
      const connectionLabel = player.connected ? '' : ' (offline)'
      return `${player.name}: ${state.roles[playerId]}${connectionLabel}`
    })
    .join(' | ')
}

export function getVersusPlayersSummary(state: GameState): string {
  const versus = state.versus
  if (!versus) {
    return '-'
  }

  return playerOrder
    .filter((playerId) => state.players[playerId].connected)
    .map((playerId) => {
      const player = state.players[playerId]
      const playerRun = versus.runs[playerId]
      if (playerRun && playerRun.finishedAtSeconds !== null) {
        return `${player.name}: #${playerRun.finishRank ?? '-'} ${formatRaceTime(playerRun.finishedAtSeconds)}`
      }

      return `${player.name}: racing`
    })
    .join(' | ')
}

export { PING_LIFETIME_SECONDS }

export interface Vector2 {
  x: number
  y: number
}

export type GameMode = 'coop' | 'versus'
export type CoopPlayerId = 'player1' | 'player2' | 'player3'
export type PlayerId =
  | CoopPlayerId
  | 'player4'
  | 'player5'
  | 'player6'
  | 'player7'
  | 'player8'
export type PlayerRole = 'direction' | 'power' | 'midJump'
export type GamePhase = 'charging' | 'airborne' | 'resetting' | 'finished'

export interface PlayerProfile {
  name: string
  color: number
  connected: boolean
}

export interface PlayerPing {
  playerId: PlayerId
  position: Vector2
  createdAtSeconds: number
}

export interface FrogBodyState {
  position: Vector2
  velocity: Vector2
}

export interface ResetNoticeState {
  message: string
  remainingSeconds: number
}

export interface FrogRunState {
  elapsedSeconds: number
  phase: GamePhase
  frog: FrogBodyState
  activeDirection: Vector2
  jumpDirection: Vector2
  jumpPower: number
  midAirJumpUsed: boolean
  jumpCount: number
  finishedAtJumpCount: number | null
  resetNotice: ResetNoticeState | null
}

export interface VersusPlayerRun {
  run: FrogRunState
  finishedAtSeconds: number | null
  finishRank: number | null
}

export interface VersusGhostSample {
  elapsedSeconds: number
  phase: GamePhase
  frog: FrogBodyState
  jumpDirection: Vector2
}

export interface VersusBestGhost {
  playerId: PlayerId
  name: string
  finishedAtSeconds: number
  jumpCount: number
  samples: VersusGhostSample[]
}

export interface VersusResultEntry {
  playerId: PlayerId
  name: string
  finishedAtSeconds: number
  jumpCount: number
  rank: number
}

export interface VersusState {
  status: 'waiting' | 'countdown' | 'running' | 'finished'
  raceElapsedSeconds: number
  countdownRemainingSeconds: number
  ready: Partial<Record<PlayerId, boolean>>
  runs: Partial<Record<PlayerId, VersusPlayerRun>>
  winnerPlayerId: PlayerId | null
  results: VersusResultEntry[]
  bestGhost: VersusBestGhost | null
}

export interface GameState extends FrogRunState {
  mode: GameMode
  roles: Record<CoopPlayerId, PlayerRole>
  players: Record<PlayerId, PlayerProfile>
  pings: PlayerPing[]
  versus: VersusState | null
}

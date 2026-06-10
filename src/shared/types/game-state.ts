export interface Vector2 {
  x: number
  y: number
}

export type PlayerId = 'player1' | 'player2' | 'player3'
export type PlayerRole = 'direction' | 'power' | 'midJump'
export type GamePhase = 'charging' | 'airborne' | 'resetting' | 'finished'

export interface FrogBodyState {
  position: Vector2
  velocity: Vector2
}

export interface ResetNoticeState {
  message: string
  remainingSeconds: number
}

export interface GameState {
  phase: GamePhase
  frog: FrogBodyState
  activeDirection: Vector2
  jumpDirection: Vector2
  jumpPower: number
  roles: Record<PlayerId, PlayerRole>
  midAirJumpUsed: boolean
  jumpCount: number
  finishedAtJumpCount: number | null
  resetNotice: ResetNoticeState | null
}

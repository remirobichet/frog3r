import type { GameState } from '@shared/types/game-state'

export class GameRoom {
  public constructor(private readonly state: GameState) {}

  public getState(): GameState {
    return this.state
  }
}

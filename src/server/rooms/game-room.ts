import { simulateTick } from '@shared/utils/gameplay'
import type { GameState } from '@shared/types/game-state'

export class GameRoom {
  public constructor(private state: GameState) {}

  public getState(): GameState {
    return this.state
  }

  public tick(deltaSeconds: number): void {
    this.state = simulateTick(this.state, deltaSeconds)
  }
}

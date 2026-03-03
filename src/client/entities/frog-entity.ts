export interface FrogEntityState {
  x: number
  y: number
  velocityX: number
  velocityY: number
}

export class FrogEntity {
  public constructor(private readonly state: FrogEntityState) {}

  public getState(): FrogEntityState {
    return this.state
  }
}

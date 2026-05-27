import type { Vector2 } from '@shared/types/game-state'

export interface Platform {
  x: number
  y: number
  width: number
  height: number
}

export interface LevelData {
  id: string
  name: string
  worldWidth: number
  worldHeight: number
  spawn: Vector2
  platforms: Platform[]
  backgroundColor: number
  platformColor: number
}

export interface LevelSummary {
  id: string
  name: string
}

export interface TiledProperty {
  name: string
  type: string
  value: boolean | number | string
}

export interface TiledObject {
  id: number
  name?: string
  type?: string
  x: number
  y: number
  width?: number
  height?: number
  point?: boolean
}

export interface TiledObjectLayer {
  id: number
  name: string
  type: string
  objects: TiledObject[]
}

export interface TiledMap {
  type: string
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledObjectLayer[]
  properties?: TiledProperty[]
}

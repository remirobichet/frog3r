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
  tileWidth: number
  tileHeight: number
  spawn: Vector2
  platforms: Platform[]
  tileLayers: TileLayerData[]
  backgroundColor: number
  platformColor: number
}

export interface TileLayerData {
  name: string
  width: number
  height: number
  data: number[]
  opacity: number
  visible: boolean
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
  draworder?: string
  opacity?: number
  visible?: boolean
  x?: number
  y?: number
  objects: TiledObject[]
}

export interface TiledTileLayer {
  id: number
  name: string
  type: string
  width: number
  height: number
  data: number[] | string
  compression?: string
  encoding?: string
  opacity?: number
  visible?: boolean
  x?: number
  y?: number
}

export type TiledLayer = TiledObjectLayer | TiledTileLayer

export interface TiledMap {
  type: string
  version?: string | number
  tiledversion?: string
  orientation?: string
  renderorder?: string
  width: number
  height: number
  tilewidth: number
  tileheight: number
  infinite?: boolean
  nextlayerid?: number
  nextobjectid?: number
  tilesets?: unknown[]
  layers: TiledLayer[]
  properties?: TiledProperty[]
}

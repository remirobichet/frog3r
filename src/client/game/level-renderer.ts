import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'

import { getPlatformPosition } from '@shared/utils/gameplay'
import type { GameState } from '@shared/types/game-state'
import type { LevelData, Platform } from '@shared/types/level'

const PING_LIFETIME_SECONDS = 2
const tileAssetUrls = import.meta.glob<string>('../assets/tiles/**/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
})

export interface LoadedTileset {
  firstgid: number
  texture: Texture
  columns: number
  frameTextures: Map<number, Texture>
}

function intersectsRect(
  leftX: number,
  leftY: number,
  leftWidth: number,
  leftHeight: number,
  rightX: number,
  rightY: number,
  rightWidth: number,
  rightHeight: number,
): boolean {
  return (
    leftX < rightX + rightWidth &&
    leftX + leftWidth > rightX &&
    leftY < rightY + rightHeight &&
    leftY + leftHeight > rightY
  )
}

export function clearContainerChildren(container: Container): void {
  for (const child of container.removeChildren()) {
    child.destroy({ children: true, context: true })
  }
}

export function drawPings(pingContainer: Container, state: GameState): void {
  clearContainerChildren(pingContainer)

  for (const ping of state.pings) {
    const player = state.players[ping.playerId]
    const ageSeconds = state.elapsedSeconds - ping.createdAtSeconds
    const progress = Math.max(
      0,
      Math.min(1, ageSeconds / PING_LIFETIME_SECONDS),
    )
    const alpha = 1 - progress
    const radius = 18 + progress * 16
    const marker = new Graphics()

    marker.circle(ping.position.x, ping.position.y, radius)
    marker.stroke({ color: player.color, width: 5, alpha })
    marker.circle(ping.position.x, ping.position.y, 5)
    marker.fill({ color: player.color, alpha: Math.max(0.24, alpha) })

    pingContainer.addChild(marker)
  }
}

function getTileTexture(
  tileset: LoadedTileset,
  tileIndex: number,
  tileWidth: number,
  tileHeight: number,
): Texture {
  const cachedTexture = tileset.frameTextures.get(tileIndex)
  if (cachedTexture) {
    return cachedTexture
  }

  const sourceX = (tileIndex % tileset.columns) * tileWidth
  const sourceY = Math.floor(tileIndex / tileset.columns) * tileHeight
  const texture = new Texture({
    source: tileset.texture.source,
    frame: new Rectangle(sourceX, sourceY, tileWidth, tileHeight),
  })

  tileset.frameTextures.set(tileIndex, texture)
  return texture
}

function drawTileLayers(
  tileContainer: Container,
  tilesets: LoadedTileset[],
  level: LevelData,
  elapsedSeconds: number,
): Set<Platform> {
  clearContainerChildren(tileContainer)
  const movingPlatformsWithTiles = new Set<Platform>()

  if (tilesets.length === 0) {
    return movingPlatformsWithTiles
  }

  const movingPlatforms = level.platforms.filter(
    (platform) => platform.movement,
  )

  for (const layer of level.tileLayers) {
    const layerContainer = new Container()
    layerContainer.alpha = layer.opacity

    for (let index = 0; index < layer.data.length; index += 1) {
      const gid = layer.data[index] & 0x1fffffff
      if (gid <= 0) {
        continue
      }

      const tileset = getTilesetForGid(gid, tilesets)
      if (!tileset) {
        continue
      }

      const tileIndex = gid - tileset.firstgid
      const texture = getTileTexture(
        tileset,
        tileIndex,
        level.tileWidth,
        level.tileHeight,
      )
      const sprite = new Sprite(texture)
      const tileX = (index % layer.width) * level.tileWidth
      const tileY = Math.floor(index / layer.width) * level.tileHeight
      const movingPlatform = movingPlatforms.find((platform) =>
        intersectsRect(
          tileX,
          tileY,
          level.tileWidth,
          level.tileHeight,
          platform.x,
          platform.y,
          platform.width,
          platform.height,
        ),
      )

      if (movingPlatform) {
        movingPlatformsWithTiles.add(movingPlatform)
        const platformPosition = getPlatformPosition(
          movingPlatform,
          elapsedSeconds,
        )
        sprite.x = platformPosition.x + tileX - movingPlatform.x
        sprite.y = platformPosition.y + tileY - movingPlatform.y
      } else {
        sprite.x = tileX
        sprite.y = tileY
      }
      layerContainer.addChild(sprite)
    }

    tileContainer.addChild(layerContainer)
  }

  return movingPlatformsWithTiles
}

function getTilesetForGid(
  gid: number,
  tilesets: LoadedTileset[],
): LoadedTileset | null {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (tileset && gid >= tileset.firstgid) {
      return tileset
    }
  }

  return null
}

function getTilesetAssetUrl(source: string): string | null {
  const pngPath = source.replace(/\.tsx$/, '.png')
  const scaledPath = `../assets/tiles/four-season-40/${pngPath.replace(/^four-season\//, '')}`
  const originalPath = `../assets/tiles/${pngPath}`

  return tileAssetUrls[scaledPath] ?? tileAssetUrls[originalPath] ?? null
}

export async function loadTilesets(level: LevelData): Promise<LoadedTileset[]> {
  const loadedTilesets = await Promise.all(
    level.tilesets.map(async (tileset) => {
      const assetUrl = getTilesetAssetUrl(tileset.source)
      if (!assetUrl) {
        throw new Error(`Missing tileset asset for ${tileset.source}`)
      }

      const texture = await Assets.load<Texture>(assetUrl)
      return {
        firstgid: tileset.firstgid,
        texture,
        columns: Math.floor(texture.width / level.tileWidth),
        frameTextures: new Map<number, Texture>(),
      }
    }),
  )

  return loadedTilesets.filter((tileset) => tileset.columns > 0)
}

export function drawLevel(
  background: Graphics,
  tiles: Container,
  tilesets: LoadedTileset[],
  platforms: Graphics,
  level: LevelData,
  elapsedSeconds: number,
): void {
  background.clear()
  background.rect(0, 0, level.worldWidth, level.worldHeight)
  background.fill(level.backgroundColor)

  const movingPlatformsWithTiles = drawTileLayers(
    tiles,
    tilesets,
    level,
    elapsedSeconds,
  )

  platforms.clear()
  for (const platform of level.platforms) {
    if (!platform.movement || movingPlatformsWithTiles.has(platform)) {
      continue
    }

    const position = getPlatformPosition(platform, elapsedSeconds)
    platforms.rect(position.x, position.y, platform.width, platform.height)
    platforms.fill({ color: level.platformColor, alpha: 0.28 })
  }
}

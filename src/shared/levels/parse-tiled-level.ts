import type {
  LevelData,
  Platform,
  TiledLayer,
  TiledMap,
  TiledObject,
  TiledObjectLayer,
  TiledProperty,
  TiledTileLayer,
} from '@shared/types/level'

function getProperty<T extends TiledProperty['value']>(
  properties: TiledProperty[] | undefined,
  name: string,
  type: string,
): T | null {
  const property = properties?.find((entry) => entry.name === name && entry.type === type)
  if (!property) {
    return null
  }

  return property.value as T
}

function parseColor(hexColor: string | null, fallback: number): number {
  if (!hexColor) {
    return fallback
  }

  return Number.parseInt(hexColor.replace('#', ''), 16)
}

function parsePlatform(object: TiledObject): Platform | null {
  const width = object.width ?? 0
  const height = object.height ?? 0
  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    x: object.x,
    y: object.y,
    width,
    height,
  }
}

function isObjectLayer(layer: TiledLayer): layer is TiledObjectLayer {
  return layer.type === 'objectgroup' && 'objects' in layer && Array.isArray(layer.objects)
}

function isTileLayer(layer: TiledLayer): layer is TiledTileLayer {
  return layer.type === 'tilelayer' && 'data' in layer
}

function parseTileLayerData(layer: TiledTileLayer): number[] {
  if (Array.isArray(layer.data)) {
    return layer.data
  }

  if (typeof layer.data === 'string' && layer.encoding === 'csv' && !layer.compression) {
    return layer.data
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
  }

  return []
}

export function parseTiledLevel(id: string, map: TiledMap): LevelData {
  const displayNameProperty = getProperty(map.properties, 'displayName', 'string')
  const backgroundColorProperty = getProperty(map.properties, 'backgroundColor', 'string')
  const platformColorProperty = getProperty(map.properties, 'platformColor', 'string')
  const displayName = typeof displayNameProperty === 'string' ? displayNameProperty : id
  const backgroundColor = parseColor(
    typeof backgroundColorProperty === 'string' ? backgroundColorProperty : null,
    0x1b3a2f,
  )
  const platformColor = parseColor(
    typeof platformColorProperty === 'string' ? platformColorProperty : null,
    0x2e5236,
  )

  const platformsLayer = map.layers.find(
    (layer): layer is TiledObjectLayer => layer.name === 'platforms' && isObjectLayer(layer),
  )
  if (!platformsLayer) {
    throw new Error(`Tiled level ${id} is missing a platforms layer`)
  }

  const spawnObject = map.layers
    .filter(isObjectLayer)
    .flatMap((layer) => layer.objects)
    .find((object) => object.name === 'spawn' || object.type === 'spawn')

  if (!spawnObject) {
    throw new Error(`Tiled level ${id} is missing a spawn marker`)
  }

  const finishObject = map.layers
    .filter(isObjectLayer)
    .flatMap((layer) => layer.objects)
    .find((object) => object.name === 'finish' || object.type === 'finish')

  if (!finishObject) {
    throw new Error(`Tiled level ${id} is missing a finish marker`)
  }

  const finish = parsePlatform(finishObject)
  if (!finish) {
    throw new Error(`Tiled level ${id} finish marker must be a rectangle`)
  }

  const platforms = platformsLayer.objects
    .map(parsePlatform)
    .filter((platform): platform is Platform => platform !== null)
    .sort((left, right) => (left.y - right.y) || (left.x - right.x))

  if (platforms.length === 0) {
    throw new Error(`Tiled level ${id} must contain at least one platform`)
  }

  const tileLayers = map.layers
    .filter(isTileLayer)
    .map((layer) => ({
      name: layer.name,
      width: layer.width,
      height: layer.height,
      data: parseTileLayerData(layer),
      opacity: layer.opacity ?? 1,
      visible: layer.visible ?? true,
    }))
    .filter((layer) => layer.visible && layer.data.length > 0)

  return {
    id,
    name: displayName,
    worldWidth: map.width * map.tilewidth,
    worldHeight: map.height * map.tileheight,
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    spawn: {
      x: spawnObject.x,
      y: spawnObject.y,
    },
    finish,
    platforms,
    tileLayers,
    backgroundColor,
    platformColor,
  }
}

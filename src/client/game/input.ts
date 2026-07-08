import type { Vector2 } from '@shared/types/game-state'
import type { LevelData } from '@shared/types/level'

export interface KeyboardState {
  pressed: Set<string>
  justPressed: Set<string>
}

export interface MouseState {
  x: number
  y: number
  isInsideCanvas: boolean
  pendingPingPosition: Vector2 | null
  pendingDebugTeleportPosition: Vector2 | null
}

export interface KeyboardSetup {
  state: KeyboardState
  destroy: () => void
}

export interface MouseSetup {
  state: MouseState
  destroy: () => void
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function setupKeyboard(): KeyboardSetup {
  const state: KeyboardState = {
    pressed: new Set<string>(),
    justPressed: new Set<string>(),
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableEventTarget(event.target)) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
    }

    if (!state.pressed.has(event.code)) {
      state.justPressed.add(event.code)
    }

    state.pressed.add(event.code)
  }

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (isEditableEventTarget(event.target)) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
    }

    state.pressed.delete(event.code)
  }

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  return {
    state,
    destroy: () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    },
  }
}

export function setupMouse(canvas: HTMLCanvasElement, level: LevelData): MouseSetup {
  const state: MouseState = {
    x: level.worldWidth / 2,
    y: level.spawn.y - 160,
    isInsideCanvas: false,
    pendingPingPosition: null,
    pendingDebugTeleportPosition: null,
  }

  const getCanvasPosition = (event: PointerEvent): Vector2 => {
    const bounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / bounds.width
    const scaleY = canvas.height / bounds.height

    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
    }
  }

  const handlePointerMove = (event: PointerEvent): void => {
    const position = getCanvasPosition(event)
    state.x = position.x
    state.y = position.y
    state.isInsideCanvas = true
  }

  const handlePointerDown = (event: PointerEvent): void => {
    const position = getCanvasPosition(event)
    state.x = position.x
    state.y = position.y
    state.isInsideCanvas = true

    if (event.button === 1 && import.meta.env.DEV) {
      event.preventDefault()
      state.pendingDebugTeleportPosition = position
      return
    }

    if (event.button !== 0) {
      return
    }

    state.pendingPingPosition = position
  }

  const handlePointerLeave = (): void => {
    state.isInsideCanvas = false
  }

  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerdown', handlePointerDown)
  canvas.addEventListener('pointerleave', handlePointerLeave)

  return {
    state,
    destroy: () => {
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    },
  }
}

export function getDirectionalVector(
  mouse: MouseState,
  frogRenderPosition: Vector2,
): Vector2 {
  if (!mouse.isInsideCanvas) {
    return { x: 0, y: -1 }
  }

  return {
    x: mouse.x - frogRenderPosition.x,
    y: mouse.y - frogRenderPosition.y,
  }
}

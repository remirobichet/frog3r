# AGENTS.md - Frog3r

## Project Overview

Frog3r is a cooperative 3-player game where players control different aspects of a frog's jump. One player aims the jump, one charges and releases it, and one triggers the mid-air jump. Roles rotate after each landing. Built with TypeScript, PixiJS, and Colyseus for multiplayer.

---

## Build Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm run dev          # Start dev server with hot reload
pnpm run dev:client   # Client only
pnpm run dev:server   # Server only

# Build
pnpm run build        # Build for production
pnpm run build:client # Build client only
pnpm run build:server # Build server only

# Lint
pnpm run lint        # Run ESLint
pnpm run lint:fix    # Fix lint errors

# Type check
pnpm run typecheck   # Run TypeScript type checking

# Test
pnpm test            # Run all tests
pnpm test -- --testNamePattern="MyTest"  # Run single test
pnpm test -- --watch # Watch mode
pnpm run test:coverage # Coverage report
```

---

## Code Style Guidelines

### General

- Use 2 spaces for indentation
- Use single quotes for strings
- Trailing commas on multiline objects/arrays
- No semicolons (unless required)
- Max line length: 100 characters

### Imports

```typescript
// External first, then relative
import { Something } from 'external-package';
import { AnotherThing } from './relative/path';

// Named imports preferred over default
import { Game, Player, Constants } from '../shared';

// Type-only imports
import type { PlayerState } from '../shared/types';
import { type Vector2, type JumpParams } from './math';
```

### Naming Conventions

- **Files**: kebab-case (`player-controller.ts`)
- **Classes/PascalCase**: `class GameRenderer`
- **Functions/camelCase**: `function calculateJumpPower()`
- **Constants/UPPER_SNAKE_CASE**: `const MAX_JUMP_POWER = 100`
- **Interfaces**: PascalCase with `I` prefix optional: `interface PlayerState` or `interface IPlayerState`
- **Types**: PascalCase: `type JumpResult = { ... }`
- **Enums**: PascalCase, enum members UPPER_SNAKE_CASE

### TypeScript

- Enable `strict: true` in tsconfig
- Always declare return types for functions
- Use `interface` over `type` for object shapes
- Use `enum` sparingly; prefer const objects
- Avoid `any`, use `unknown` when type is truly unknown

```typescript
// Good
function calculateJumpPower(direction: Vector2, power: number): JumpResult {
  return { ... };
}

// Bad
function calculateJumpPower(direction, power) {
  return { ... };
}
```

### Error Handling

- Use custom error classes for game-specific errors
- Always handle async errors with try/catch
- Log errors with appropriate context
- Never expose raw errors to clients

```typescript
class GameError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
```

### Game-Specific Patterns

- Use Entity-Component pattern for game objects
- Keep game logic separate from rendering
- Use fixed timestep for physics (60 FPS)
- Store shared state in Colyseus room, not client-side

### Git Conventions

- Branches: `feature/description`, `bugfix/description`, `hotfix/description`
- Commits: conventional commits (`feat:`, `fix:`, `refactor:`)
- PR titles: Imperative mood ("Add feature" not "Added feature")

---

## Project Structure

```
/home/remi/perso-workspace/frogy
├── src/
│   ├── client/          # PixiJS client
│   │   ├── scenes/      # Game scenes
│   │   ├── entities/    # Game entities
│   │   ├── ui/          # UI components
│   │   └── main.ts      # Client entry
│   ├── server/          # Colyseus server
│   │   ├── rooms/       # Game rooms
│   │   ├── handlers/    # Message handlers
│   │   └── main.ts      # Server entry
│   └── shared/          # Shared code
│       ├── types/       # TypeScript types
│       ├── constants/   # Game constants
│       └── utils/       # Shared utilities
├── public/              # Static assets
├── tests/               # Test files
├── package.json
├── tsconfig.json
├── eslint.config.js
└── vite.config.ts
```

---

## Testing

- Use Vitest for unit tests
- Test files: `*.test.ts` or `*.spec.ts` in `__tests__/` folders
- Mock external dependencies (PixiJS, Colyseus)
- Focus tests on: physics calculations, state management, input handling
- Minimum coverage target: 70%

```typescript
// Example test
import { describe, it, expect } from 'vitest';
import { calculateJumpDistance } from '../shared/physics';

describe('calculateJumpDistance', () => {
  it('should calculate correct distance for given power and direction', () => {
    const result = calculateJumpDistance(50, { x: 1, y: 0 });
    expect(result).toBeCloseTo(50, 1);
  });
});
```

---

## Performance Considerations

- Object pooling for frequently created objects (particles, projectiles)
- Use PixiJS ParticleContainer for large particle counts
- Limit network updates to 20-30Hz for non-critical state
- Use requestAnimationFrame for rendering, fixed timestep for physics

---

## Useful Commands

```bash
# Check for circular dependencies
pnpm run depcheck

# Analyze bundle size
pnpm run build:analyze

# Preview production build
pnpm run preview
```

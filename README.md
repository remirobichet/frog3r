# Frogg3r

Frogg3r is a cooperative 3-player multiplayer game where each player controls one part of a frog's jump cycle.

- Player 1 aims the jump direction
- Player 2 charges and releases jump power
- Player 3 triggers a single mid-air mini jump
- Roles rotate after every landing

The project is built with TypeScript, PixiJS for rendering, and Colyseus for real-time multiplayer.

## How It Works

Each room supports up to 3 players.

1. Create a room from the lobby
2. Share the generated invite link or invite code
3. Other players join from the same browser app
4. The frog launches when the power player stops charging
5. After landing, roles rotate for the next jump

The room creator can also switch between the currently registered levels.

## Tech Stack

- TypeScript
- Vite
- PixiJS
- Colyseus
- Express
- Vitest
- ESLint
- pnpm

## Requirements

- Node.js 20+ recommended
- pnpm 10+

## Getting Started

```bash
pnpm install
pnpm run dev
```

This starts:

- The Vite client on `http://localhost:5173`
- The Colyseus + Express server on `http://localhost:2567`

Open the client in your browser, create a room, and share the invite link with the other players.

## Available Scripts

```bash
pnpm run dev           # Run client and server together
pnpm run dev:client    # Run Vite client only
pnpm run dev:server    # Run Colyseus server only

pnpm run build         # Build client and server
pnpm run build:client  # Build client bundle
pnpm run build:server  # Build server bundle

pnpm run lint          # Run ESLint
pnpm run lint:fix      # Auto-fix lint issues
pnpm run typecheck     # Run TypeScript checks

pnpm test              # Run tests once
pnpm run test:coverage # Run tests with coverage
pnpm run preview       # Preview production client build
```

## Project Structure

```text
src/
  client/
    assets/            Client assets
    entities/          Rendered game entities
    game/              Runtime bootstrapping
    network/           Lobby and room API client
    scenes/            Pixi scenes
    ui/                Lobby and HUD UI
    main.ts            Client entry point
  server/
    handlers/          Server input handling helpers
    rooms/             Colyseus room logic
    main.ts            Server entry point
  shared/
    constants/         Shared gameplay constants
    levels/            Registered levels and tiled data
    types/             Shared state and network contracts
    utils/             Shared gameplay simulation
tests/
  shared/              Gameplay and level tests
```

## Networking

The server exposes:

- `GET /api/health` for a simple health check
- `POST /api/rooms` to create a room
- `POST /api/rooms/join` to join by invite code

Realtime gameplay runs through Colyseus WebSocket rooms with a maximum of 3 clients per room.

## Gameplay Model

The shared simulation handles:

- Direction normalization
- Jump charging and launch velocity
- A single mid-air mini jump per jump
- Gravity and landing detection
- Role rotation after landing

The server runs the simulation on a fixed `60 FPS` timestep and broadcasts the authoritative state to all connected clients.

## Testing

Tests cover core shared gameplay behavior, including:

- Charging and launch behavior
- One-time mid-air jump behavior
- Role rotation after landing
- Level parsing and registration

Run them with:

```bash
pnpm test
```

## Notes

- The browser client assumes the game server is reachable on port `2567`
- Invite links use the current browser origin and append `?room=INVITE_CODE`
- The production server build is emitted to `dist/server`

## Possible new features

- Add jump prediction arc Show a dotted trajectory while aiming/charging. This would immediately make the game feel more readable and less random, especially for new players.
- Add coyote-time style forgiveness Allow a tiny landing/edge grace window for mid-air jump or platform detection. This makes controls feel fairer without making the game easier in a cheap way.
- Improve power curve Current charge is linear. Consider a curved charge meter: low power charges quickly, high power charges slowly. This gives players more precision and makes max-power timing more interesting.
- Add role-specific feedback Each role should get clearer feedback: Aim: visible aim ownership and cursor/arrow highlight. Charge: charge pulse, threshold ticks, release anticipation. Mid-jump: “ready” indicator only when airborne and unused.
- Add fail-state variety Right now failures reset. Add small outcome differences: Trap impact animation. Frog stunned briefly before reset. “Best attempt distance” marker. This makes failure feel less abrupt.
- Add collectibles or optional routing Coins, flies, checkpoints, or bonus lilies would give players reasons to take risky jumps instead of only reaching the finish.
- Add checkpoints Full reset is harsh. You could have checkpoint platforms or checkpoint flowers. Good for longer levels and co-op frustration control.
- Add level mechanics Current mechanics are platforms/traps/trampolines/slippery/moving. Strong next additions: Wind zones. Water current. Breakable platforms. One-way platforms. Sticky walls. Rotating platforms. Bounce pads with direction.
- Improve versus fairness Versus currently starts runs per connected player. Consider: Countdown start. Restart race button. Ghost replay of best run. Per-player ready state. This makes versus feel like a proper race mode.
- Add scoring Coop could score by: Jump count. Time. Death/reset count. Collectibles. This gives replayability after “just finish the level”.

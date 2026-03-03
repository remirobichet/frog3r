# 🐸 Dual Mind Frog

## 🎮 Concept

**Two players control a single frog.**

- Player 1 controls the **direction** of the jump.
- Player 2 controls the **power** of the jump.
- Both players can trigger a **mid-air mini jump**, but:
  - There is **only one per jump**
  - The **first player who presses the key** activates it

After every jump, the roles **automatically swap**.

---

## 🧠 Core Gameplay Loop

1.  Coordinate before the jump
2.  Charge the jump power
3.  Launch
4.  Manage the mid-air mini jump
5.  Land
6.  Roles swap
7.  Repeat

Goal: finish the level as fast as possible.

---

## 🚀 Game Objective

A cooperative game that is **fun and speedrun-friendly**, built around:

- Communication
- Adaptation
- Timing
- Coordination

Each level is designed to be completed in around **60 seconds**.

---

## 🔄 Key Mechanic

### 🔁 Automatic Role Swap

After every jump: - The player who controlled direction now controls
power - The player who controlled power now controls direction

This prevents one player from carrying the other and keeps tension high.

---

## 🛠️ Technical Stack

- Frontend: TypeScript
- 2D Engine: pixijs
- Multiplayer: Colyseus
- Synchronization: Player inputs + single shared frog state

---

## 🏁 Vision

Create a simple but intense co-op experience where:

> Coordination matters more than individual skill.

A clear concept, quick to play, and deeply optimizable for speedrunning.

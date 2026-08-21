# En Garde

Open-source companion software for running **Draw Steel** at the table — a live
virtual tabletop with campaign management, character/NPC/encounter tooling, and a
canon-first rules engine.

> **Status: greenfield bootstrap.** The application substrate (backend infra +
> frontend shell) is being built and proven first; the game engine (rules canon,
> intent reducer — everything that touches Draw Steel systems) lands only after
> the app itself is healthy. See [`docs/architecture.md`](docs/architecture.md).

## Layout

| Path | Layer |
|---|---|
| `packages/backend` | Backend infra — Convex deployment: schema, functions, auth, realtime |
| `apps/web` | Frontend — the UI that accesses the game engine |
| `packages/engine` | *(reserved)* The game engine — Draw Steel rules made playable |

## Development

Requires Node 24+ and pnpm 9.

```sh
pnpm install
pnpm dev        # web app + convex dev (backend needs a one-time `pnpm dev:backend` login)
pnpm test       # vitest across all workspaces
pnpm typecheck
pnpm lint
```

## License

Code is licensed under [AGPL-3.0](LICENSE).

En Garde is an independent product and is not affiliated with MCDM Productions,
LLC. When Draw Steel rule content lands in this repository it is used under the
[Draw Steel Creator License](https://www.mcdmproductions.com/), with attribution
carried alongside the content. No rulebook content is present at this stage.

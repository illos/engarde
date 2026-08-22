# En Garde

Open-source companion software for running **Draw Steel** at the table — a live
virtual tabletop with campaign management, character/NPC/encounter tooling, and a
canon-first rules engine.

Production home: [en-garde.app](https://en-garde.app) (deployment pending).

> **Status: greenfield bootstrap.** The application substrate (backend infra +
> frontend shell) is being built and proven first; the game engine (rules canon,
> intent reducer — everything that touches Draw Steel systems) lands only after
> the app itself is healthy. See [`docs/architecture.md`](docs/architecture.md).

## Layout

| Path | Layer |
|---|---|
| `packages/backend` | Backend infra — Convex deployment: schema, functions, auth, realtime |
| `apps/web` | Frontend — the UI that accesses the game engine |
| `apps/control-center` | System Control Center — separate Operator-only installation administration |
| `packages/engine` | *(reserved)* The game engine — Draw Steel rules made playable |

## Development

Requires Node 24+ and pnpm 9.

```sh
pnpm install
pnpm dev        # player UI :5173 + control center :5174 + Convex backend
pnpm test       # vitest across all workspaces
pnpm typecheck
pnpm lint
```

### Authentication environment

Convex Auth requires `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` on each deployment.
Local development intentionally needs no email credentials. Set
`ENGARDE_AUTH_EMAIL_CONSOLE=true` explicitly to write verification and
password-reset codes to the backend console. Without that flag, missing or partial
Cloudflare configuration fails closed.

Verification and reset delivery is limited to three messages per email address
and purpose in each 15-minute window.

To enable real delivery, set these Convex deployment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_EMAIL_API_TOKEN` — a least-privilege token with `Email Sending: Edit`
- `ENGARDE_EMAIL_FROM` — an address on a domain onboarded for Cloudflare Email Sending

The sender domain must use Cloudflare DNS. Sending to arbitrary recipients currently
requires Workers Paid.

Installation setup is deliberately separate from player onboarding. Set a strong,
one-time `ENGARDE_SETUP_CAPABILITY`, open the **System Control Center**, and
authenticate a verified identity. Its sealed setup flow establishes the first
`instanceOperators` entitlement and permanently rejects the capability after setup;
creating a player profile never grants installation authority. See
[`docs/system-control-center-plan.md`](docs/system-control-center-plan.md).

The local control center is served at `http://127.0.0.1:5174`. It shares the player
app's `VITE_CONVEX_URL` configuration while keeping its route tree and production
artifact separate.

## License

Code is licensed under [AGPL-3.0](LICENSE).

En Garde is an independent product and is not affiliated with MCDM Productions,
LLC. When Draw Steel rule content lands in this repository it is used under the
[Draw Steel Creator License](https://www.mcdmproductions.com/), with attribution
carried alongside the content. No rulebook content is present at this stage.

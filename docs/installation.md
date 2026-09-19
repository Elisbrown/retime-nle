# Installation

Requires Node 18+.

From npm (once published):

```bash
npm install retime-nle
```

From this repo (local dev):

```bash
cd retime
npm install
```

Dev dependencies installed (`package.json`):

- `typescript`
- `@types/node`
- `@types/react`

Peer dependencies by entry point:

- `retime-nle` (core + CLI): no peers required.
- `retime-nle/react`: `react >= 18` required; `remotion >= 4` for `ReTimeTrack`; `@remotion/player >= 4` for the Player controls slot.

Build output goes to `dist/`:

```bash
npm run build      # tsc -p tsconfig.json
npm run typecheck  # tsc --noEmit
```

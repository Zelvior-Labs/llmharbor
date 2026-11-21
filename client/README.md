# LLMHarbor dashboard

The React + Vite + Tailwind dashboard for LLMHarbor (npm workspace `client`). In production the
server serves the built files from `client/dist`, so the dashboard and the API share one port.

## Scripts

Run from the repository root (`npm run <script> -w client`) or from this directory:

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server on port 5173. It proxies `/api` and `/v1` to `127.0.0.1:<PORT>` (`PORT` from the root `.env`, default 3001). |
| `build` | Type-check (`tsc -b`) and build into `dist/`. |
| `test` | Vitest, then `check:i18n`. |
| `check:i18n` | Check that every locale has the same keys, value types and `{placeholder}` names as `en.json`. |
| `lint` | ESLint. |
| `preview` | Serve the production build locally. |

The root `npm run dev` starts this dev server together with the API server.

## Layout

- `src/pages/`: one component per route (Models, Playground, Keys, Agents, Analytics, Logs,
  Premium, …). Routes are defined in `src/App.tsx`.
- `src/components/`: shared UI. `components/keys/shared.tsx` holds the provider list shown on the
  Keys page.
- `src/i18n/locales/`: 60 locale files. `en.json` is the source of truth, and locales are registered
  in `src/i18n/locale-config.ts`.
- `src/lib/api.ts`: API client. It keeps the session token in local storage under
  `llmharbor_dashboard_token`.

Build modes used by other packages: `--mode android` (Android APK) and `--mode win7` (Windows 7
edition). `VITE_BASE` sets the base path.

# ACU Language Platform

A language learning platform built for the Faculty of Languages and Translation at
Ahram Canadian University. Learners take a placement test, then practise listening,
speaking, reading and writing at their level in Arabic, English, French, German,
Chinese and Japanese. Instructors can follow the progress of their own students and
run exams for them.

This repository is a graduation project for the Faculty of Computer Science and
Information Technology, Ahram Canadian University.

> Status: early development. The engineering foundation is in place; product features
> are being built section by section.

## Tech stack

| Layer    | Choice                                                              |
| -------- | ------------------------------------------------------------------- |
| Web      | React 19, Vite, TypeScript, CSS Modules, React Router, i18next      |
| API      | Node.js 24, Express 5, TypeScript, Zod, Pino                        |
| Shared   | Zod schemas and types used by both the web app and the API          |
| Database | PostgreSQL 18 (Docker Compose for local development)                |
| Quality  | ESLint (type-aware), Stylelint, Prettier, Vitest, Husky, commitlint |
| CI       | GitHub Actions                                                      |

## Repository layout

```
apps/
  api/        HTTP API (Express)
  web/        Single-page web client (React)
packages/
  shared/     Contracts, constants and types shared across apps
docs/         Architecture notes and conventions
```

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together and
[docs/design-system.md](docs/design-system.md) for the visual language. The live component
reference is at `/design-system` in the running app.

## Getting started

Requirements: Node.js 24, pnpm 10, and Docker (only needed once the database is in use).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

The web app runs on http://localhost:5173 and proxies `/api` requests to the API on
http://localhost:4000.

To start the local database, copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`,
then run `pnpm db:up`.

## Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | Run the web app and the API in watch mode    |
| `pnpm build`        | Build every package                          |
| `pnpm test`         | Run all unit and integration tests           |
| `pnpm typecheck`    | Type-check every package                     |
| `pnpm lint`         | Lint TypeScript across the repository        |
| `pnpm lint:css`     | Lint stylesheets (logical properties only)   |
| `pnpm format`       | Format files with Prettier                   |
| `pnpm db:up / down` | Start or stop the local PostgreSQL container |

## Contributing

Commit messages follow Conventional Commits and are checked on commit. Staged files are
linted and formatted automatically. Details are in
[docs/conventions.md](docs/conventions.md).

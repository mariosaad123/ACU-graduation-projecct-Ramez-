# ACU Language Platform

A language learning platform built for the Faculty of Languages and Translation at
Ahram Canadian University. Learners take a placement test, then practise listening,
speaking, reading and writing at their level in Arabic, English, French, German,
Chinese and Japanese. Instructors can follow the progress of their own students and
run exams for them.

This repository is a graduation project for the Faculty of Computer Science and
Information Technology, Ahram Canadian University.

> Status: in development. The design system, Google sign-in and account setup for students
> and doctors are in place; learning features are being built section by section.

## Tech stack

| Layer    | Choice                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| Web      | React 19, Vite, TypeScript, CSS Modules, React Router, TanStack Query, i18next |
| API      | Node.js 24, Express 5, TypeScript, Zod, Pino, openid-client                    |
| Shared   | Zod contracts and types used by both the web app and the API                   |
| Database | PostgreSQL 18 with Drizzle ORM; embedded PGlite for tests and local work       |
| Quality  | ESLint (type-aware), Stylelint, Prettier, Vitest, Husky, commitlint            |
| CI       | GitHub Actions                                                                 |

## Repository layout

```
apps/
  api/        HTTP API (Express), database schema and migrations
  web/        Single-page web client (React)
packages/
  shared/     Contracts, constants and types shared across apps
docs/         Architecture, data model, sign-in and conventions
```

- [docs/architecture.md](docs/architecture.md): how the pieces fit together
- [docs/data-model.md](docs/data-model.md): tables, rules and account states
- [docs/google-sign-in.md](docs/google-sign-in.md): the sign-in flow and how to configure Google
- [docs/design-system.md](docs/design-system.md): the visual language; live at `/design-system`

## Getting started

Requirements: Node.js 24 and pnpm 10. Docker is optional.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

The web app runs on http://localhost:5173 and proxies `/api` requests to the API on
http://localhost:4000.

By default the API uses an embedded PostgreSQL build stored in `apps/api/.data/`, so nothing
else has to be installed. To use a PostgreSQL server instead, copy `.env.example` to `.env`, set
`POSTGRES_PASSWORD`, run `pnpm db:up`, and point `DATABASE_URL` in `apps/api/.env` at it.

Google sign-in needs an OAuth client: see [docs/google-sign-in.md](docs/google-sign-in.md).
In development, emails (such as doctor confirmation codes) are printed in the API output.

### First-time setup

```bash
pnpm --filter @acu/api doctor-code:set
pnpm --filter @acu/api admin:grant someone@acu.edu.eg
```

The first command sets the code faculty staff enter to register as doctors. The second makes an
existing account an administrator.

## Scripts

| Command                              | Description                                  |
| ------------------------------------ | -------------------------------------------- |
| `pnpm dev`                           | Run the web app and the API in watch mode    |
| `pnpm build`                         | Build every package                          |
| `pnpm test`                          | Run all unit and integration tests           |
| `pnpm typecheck`                     | Type-check every package                     |
| `pnpm lint`                          | Lint TypeScript across the repository        |
| `pnpm lint:css`                      | Lint stylesheets (logical properties only)   |
| `pnpm format`                        | Format files with Prettier                   |
| `pnpm db:up / down`                  | Start or stop the local PostgreSQL container |
| `pnpm --filter @acu/api db:generate` | Write a migration from schema changes        |
| `pnpm --filter @acu/api db:migrate`  | Apply pending migrations                     |

## Contributing

Commit messages follow Conventional Commits and are checked on commit. Staged files are
linted and formatted automatically. Details are in
[docs/conventions.md](docs/conventions.md).

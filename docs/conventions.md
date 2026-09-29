# Conventions

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are
checked by commitlint when you commit.

```
<type>(<optional scope>): <summary in the imperative mood>
```

- **Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `perf`,
  `style`, `revert`.
- **Scopes:** `web`, `api`, `shared`, `db`, `ci`, `deps`, `docs`, `repo`. Leave the scope
  out when a change spans several packages.
- Keep each commit focused on one change. Explain the reason in the body when it is not
  obvious from the summary.

## Branches

`main` is always releasable. Work happens on short-lived branches named after the change,
for example `feat/placement-test-engine` or `fix/api-port-collision`, and is merged through
a pull request once CI passes.

## Code style

- Formatting is owned by Prettier; lint rules by ESLint in type-aware strict mode. Staged
  files are fixed automatically before each commit.
- TypeScript runs in `strict` mode with `noUncheckedIndexedAccess`. Avoid `any`; parse
  unknown data with Zod at the boundary instead.
- Use `import type` for type-only imports.
- File names: `kebab-case.ts` for modules, `PascalCase.tsx` for React components, and
  `Component.module.css` for component styles.
- Organise code by feature (`modules/<feature>` in the API, `features/<feature>` in the web
  app) rather than by technical type.
- Comments explain _why_, not _what_.

## Tests

- Name tests after the behaviour they check, not the function they call.
- Test through public interfaces (HTTP for the API, rendered output for the web app).
- Every bug fix comes with a test that fails without the fix.

## Environment and secrets

- Never commit `.env` files. Document every variable in the matching `.env.example`.
- Secrets live only on the server. The web bundle must not contain API keys.

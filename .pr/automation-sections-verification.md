# Automation sections verification

Base: Canvas 1.33.0, `7a41641c6d8bcf3e2e3c19c08b778781bcf954c2`.
Implementation: `d894f8c`.

## Browser demonstration

Built with `npm run build:mock`, served locally with `npx sirv-cli build --single --dev --host 127.0.0.1 --port 3344`, and exercised in Chrome through the normal UI. All displayed automation data is the repository's synthetic MSW fixture. No production API was used.

Observed:

1. Created “Infraestrutura”; it appeared empty alongside “Sem secção” (7).
2. Used Nightly Security Pass → Move to section → Infraestrutura. Counts became 1 and 6. The grid screenshot records this result.
3. Renamed Infraestrutura to “Operações” and switched to list view. The assigned automation remained in the section; the list screenshot records this result.
4. Collapsed Operações, searched “Nightly”, and saw the matching automation expanded. Clearing search restored its collapsed state.

MSW data lives in the page process and resets on reload. Server persistence is exercised by the real SettingsClient against MSW in the component tests with a new QueryClient after unmount/remount; it has not been tested against a deployed server. The preview server was restarted after rebuilding to avoid stale asset caching.

## Automated verification

- 136 tests passed in 9 files: sections service/UI, automation list route/behavior, settings service, cards/list rows/permissions, and direct-Agent-Server-call architecture guard.
- `npm run lint`: passed (0 errors; 459 existing repository warnings).
- `npm run typecheck`: passed after the final response-validation change.
- Translation completeness: all 16 locales passed.
- `npm run build`, `npm run build:mock`, `npm run build:lib`: passed.
- `git diff --check`: passed.

Run the focused regression set with:

```sh
npx vitest run __tests__/api/automation-sections-service.test.ts __tests__/components/automation-sections.test.tsx __tests__/routes/automations-list.test.tsx __tests__/routes/automations-list-behavior.test.tsx __tests__/api/settings-service.test.ts __tests__/components/automations/automation-card.test.tsx __tests__/components/automations/automation-list-row.test.tsx __tests__/components/automations/automation-list-row.permissions.test.tsx src/api/no-direct-agent-server-calls.test.ts
```

## Release boundary

The feature is implemented in the fork, not deployed. This PR targets `pilot-1.33` to avoid silently incorporating later upstream changes. No backend image, compatibility minimum, automation schedule, or execution behavior changes. `.pr/` artifacts require manual removal before merging to this maintenance branch: the existing automatic cleanup workflow targets `main` only.

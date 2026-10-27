# Verification — shared sections

Product revision: `cb27fbe6c9c5200794d3707125f8a0b23d109873`. Base: `cf4dbfb240637e435a81a59707d159744cef5601`.

- 176 tests / 14 suites: API services, global and original dashboards, section CRUD, migration, persistence via fresh reads, duplicate IDs, native actions/history, permissions, failure handling and direct-call guard. See focused command in PR.
- `npm run lint`: passed, 459 pre-existing warnings, no errors. Staged lint/typecheck/translation checks also passed.
- `npm run build:mock` and `npm run build:lib`: passed. Production image build is captured in the GitOps PR.
- Static mock browser: `node scripts/static-server.mjs --host 127.0.0.1 --port 4175 --dir build` after `npm run build:mock`.
- Existing fictional Server and Laptop registrations; 14 fixture automations. Created Infraestrutura, assigned the two Nightly Security Pass rows (one from each server). One section showed both badges; no per-server headings. Filter Laptop showed only seven Laptop rows; All servers restored all. Grid also mixed origins.
- Mock settings reset on full reload. Persistence claims are supported by stateful service/route tests; real server settings persistence must be checked after deployment.
- No actual automation was dispatched or changed through the production UI during preview.

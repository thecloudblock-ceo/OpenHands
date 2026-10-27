# All automations across nodes

The automation navigation includes **All automations** at `/automations/all`.
It lists the local/self-hosted backends registered in this browser, grouped by
backend name. Cloud automations remain in their own backend view because their
organization selection and permissions differ.

Each node loads independently, refreshes every 30 seconds, and has its own retry
and **Load more** controls. Search matches loaded automation names/content or a
node name. Hidden DRAFT test artifacts are excluded, as on the dashboard.

Each row supports **Run now**, **Turn off / Turn on**, and **Edit** without changing
the active backend. Edit changes the name, prompt (when present), and the existing
schedule/timezone or event trigger. Other settings and source bundles are left
intact. A failed save keeps the form open with its values for retry.

## Backend ownership

`AutomationService.listAutomations`, `updateAutomation`, and `dispatchAutomation`
accept an optional explicit local backend. These calls capture the target's host
and API key and bypass the active-backend interceptor. Existing callers, including
Cloud, retain their existing transport. No new server endpoint is required.

`useNodeAutomations` owns each node's query and mutation state. Query keys contain
the backend ID and connection revision, never credentials. Rows use IDs within a
backend group, so equal automation IDs on different nodes remain independent.
Connection changes remount the group and close its editor; the mutation also checks
the registered target immediately before writing. Changing only the active node
does not retarget an action. Unreachable nodes show a retry and disable stale actions.

The view does not move automations between servers, create new schedules, or
aggregate section definitions across nodes. Existing per-node sections remain
available in the dashboard.

## Verification

- API tests exercise two hosts with distinct keys, no-key targets, rejection of
  Cloud targets, and a change of active backend during an outstanding action.
- UI tests cover identical IDs across nodes; run, pause, enable and sparse edits;
  pagination, filtering, independent failure/retry; retained edits after failure;
  and closing an editor after its backend's connection changes.
- Existing dashboard, sections and service regression tests remain applicable.

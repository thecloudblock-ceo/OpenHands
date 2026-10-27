# All automations across nodes

The **Dashboard** at `/automations` now defaults to all local/self-hosted
backends registered in this browser, grouped by backend name. `/automations/all`
remains available. The **Server** filter starts at **All servers** and narrows the
visible groups without changing the active backend or the destination of actions.
Every automation carries a server badge, including list/grid rows on a single node. Cloud automations remain in their own backend view because their
organization selection and permissions differ.

Each node loads independently, refreshes every 30 seconds, and has its own retry
and **Load more** controls. Search matches loaded automation names/content or a
node name. Hidden DRAFT test artifacts are excluded, as on the dashboard.

Click an automation name to open its details/history on the origin node. Links
include the backend identity for opening in another tab. The global route stays
available when the selected local node is offline or rejects its key; each node
still authenticates every API request. Locked Cloud authentication is unchanged.

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
available through **Manage sections** on each server group. This opens
`/automations?view=server&backend=<id>` with that node selected, retaining its
sections, drafts, overview, creation/import and list/grid controls. **All servers**
returns to the global dashboard. Cloud keeps its existing dashboard and auth gates.

## Verification

- API tests exercise two hosts with distinct keys, no-key targets, rejection of
  Cloud targets, and a change of active backend during an outstanding action.
- UI tests cover identical IDs across nodes; run, pause, enable and sparse edits;
  pagination, filtering, independent failure/retry; retained edits after failure;
  and closing an editor after its backend's connection changes.
- Existing dashboard, sections and service regression tests remain applicable.

# All automations across nodes

The **Dashboard** at `/automations` keeps the original overview, activity/history
rows, list/grid switch, filters, sections, saved drafts and full editor. It shows
all local/self-hosted backends registered in this browser by default.
`/automations/all` opens the same dashboard. The **Server** filter starts at
**All servers** and narrows visible automations without changing the active
backend or the destination of actions. Every automation carries its origin
server badge. Overview totals aggregate all loaded servers.

Each node loads independently, fetches every page automatically and refreshes
every 30 seconds. Hidden DRAFT test artifacts remain excluded. An unavailable
node displays an alert and retry control without hiding healthy nodes. The
original search and status/trigger filters remain available.

Click an automation name or an activity/history link to open that resource on its
origin node. Links include the backend identity for opening in another tab.
Run, pause/enable, delete and saved-draft actions also target the origin node.
**Edit** selects that node and opens the original full setup editor. Creation,
import and Git Sync use the active backend, labeled beside those controls.

All automations render together in shared sections, with no per-server group headings.
A single section controller creates, renames, collapses, deletes and assigns sections
across every server. Filtering by server changes visible cards, not the section catalog.
See [shared section persistence and migration](automation-sections.md#shared-dashboard-catalog). The explicit single-server dashboard
remains available at `/automations?view=server&backend=<id>`. Cloud organizations
keep their own dashboard, permissions and authentication gates.

## Backend ownership

`useGlobalAutomationDashboard` owns the independent automation and saved-draft
queries plus origin-aware mutations. `AutomationsList` consumes that model while
retaining the original presentation. `GlobalAutomationSections` adapts the
existing section panel to one shared catalog and resolves each card’s badge and
navigation from its origin.

AutomationService list, update, dispatch, delete, saved-draft and run-history
operations accept an optional explicit local backend. These calls capture the
target host and API key and bypass the active-backend interceptor. Existing
callers, including Cloud, retain their existing transport. No new server
endpoint is required. Saved-draft endpoints returning 404 or 405 are treated as
unsupported on older sidecars; other failures remain visible.

UI identities and query keys include backend ID, connection revision and native
automation ID as appropriate, never credentials. Equal automation IDs on
different nodes remain independent. Native IDs are restored at the API boundary.
Mutations verify the registered target immediately before writing; connection
changes invalidate old identities and open confirmations. Changing only the
active node does not retarget an action. Detail, history and full-editor
navigation explicitly selects the origin node.

The view does not move automations between servers or create schedules. Existing
legacy section metadata remains intact; the shared catalog imports it without
changing automation definitions or schedules.

## Verification

- API tests exercise distinct hosts and keys, no-key targets, rejection of Cloud
  targets and changes of active backend during outstanding requests.
- Dashboard tests cover duplicate IDs, aggregated totals, original controls,
  native full-editor navigation, origin-pinned run/pause/delete/history actions,
  automatic pagination, independent failure/retry and connection changes while
  a confirmation is open.
- Existing dashboard, sections, activity, permissions and service regression
  tests remain applicable. PR #8 passed 178 tests across 13 suites, lint/typecheck,
  application/library/mock builds and browser verification with fictional nodes.

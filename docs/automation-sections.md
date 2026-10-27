# Automation dashboard sections

Local/self-hosted backends support named sections in the automation dashboard. Create a section, then use an automation's action menu → Move to section. Sections work in both grid and list views; names and collapsed state are saved. Removing a section returns its automations to Unassigned without changing their definitions, schedules, enabled state, or history. Setup drafts retain their existing separate group. Cloud retains the existing Active/Inactive groups.

## State and compatibility

`AutomationSectionsService` is the sole writer of `misc_settings.canvas_automation_sections` through the existing typed `SettingsClient`. `useAutomationSections` owns the cached representation, scoped to backend ID and connection revision. It revalidates on focus and every 30 seconds. Settings share the existing local server's settings/authentication scope; they are not browser-only or newly per-user preferences.

Schema version 1 contains:

- `sections`: map of stable IDs to `{name, createdAt, collapsed, deleted}`.
- `assignments`: map of automation IDs to section IDs or `null` (Unassigned).
- `unassignedCollapsed`: boolean.

An absent namespace means no sections. Malformed data, unsupported versions, invalid settings responses, and transport failures disable editing and show an error rather than overwriting the stored data. Names are trimmed, whitespace-normalized, limited to 80 characters, and checked against existing names case-insensitively before writing.

Updates use sparse `misc_settings_diff` patches; they never replace the complete settings document or prune assignments based on the loaded/filtered automation page. Section deletion writes a tombstone; assignments to missing/deleted sections resolve to Unassigned. The server's recursive merge preserves unrelated fields, but provides no compare-and-swap: simultaneous edits to the same field are last-writer-wins, and simultaneous same-name creates are not atomically unique. Mutations from mounted consumers in one browser are serialized per backend.

The opaque `misc_settings` and recursive `misc_settings_diff` contract exists in Agent Server 1.55.0 (the Canvas compatibility minimum) and 1.58.1. This feature adds no server endpoint or typed client API and needs no backend fork/version increase. It does require read/write settings access on the selected backend.

## Filtering and rollback

Sections count the currently loaded and filtered automations. Search and filters temporarily expand matching sections and hide empty groups; clearing filters restores the saved collapse preference. Pagination does not delete assignments for unseen automations.

Rollback to an unmodified Canvas build leaves the namespaced data intact; the older UI ignores it. Restoring this build reads the same settings again. Do not remove this namespace as part of a UI rollback. Section metadata is not included in individual automation exports, because it is dashboard organization rather than part of the automation definition.

## Shared dashboard catalog

The default multi-server dashboard uses `SharedAutomationSectionsService` as the sole writer of `misc_settings.canvas_shared_automation_sections`. The owner is the registered local backend matching the served Canvas origin (or configured backend base URL); for an externally hosted/embedded Canvas without that registration, it is the first registered local backend. Selecting an active server or changing the Server filter never changes the owner. Removing/replacing that owner changes the storage destination; its original data stays on the original server. There is no network-error failover to a different catalog.

The schema extends version 1 with `importedHosts`, a map of successful legacy imports. Persistent assignment keys are JSON tuples of normalized backend URL and native automation ID. They survive browser-specific registry IDs, credential revisions and server renames; changing the backend URL establishes a new identity. UI/action IDs still include the connection revision and are checked against the live registry before a write.

Reads combine the saved shared catalog with unimported legacy sections. Equal normalized names merge into one section, preferring the owner's metadata and then URL order. Native assignments are translated to stable host/ID keys; existing shared assignments win, including explicit Unassigned. Reads do not write. The next explicit section edit persists successful imports and its sparse command together. Failed legacy reads remain unimported and retry later. Legacy namespaces remain untouched, so the explicit single-server view and older builds retain their data; subsequent legacy-view edits are not synchronized after that host has been imported. Use the shared dashboard to organize all servers.

Tombstones and import markers prevent deleted or renamed sections from being restored by later reloads. Shared settings reads must succeed before edits are allowed; malformed or unavailable shared storage disables section editing while automation actions remain usable. Requests time out after 10 seconds. Partial legacy imports may appear later as an unavailable server returns. As with local sections, simultaneous same-field changes are last-writer-wins; there is no transactional cross-browser uniqueness guarantee.

The original panel renders each shared section once in both grid and list views, mixing servers and preserving global sort order. A server badge identifies every card/row. The server filter temporarily expands matching groups and hides empty ones, using the same shared catalog for all section dialogs. No scheduler or automation backend contract changes are required.

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

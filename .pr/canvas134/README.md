# Canvas 1.34 live QA — isolated real backends

Source build: 4c34c25137d56488b7a8d703a9c529c5e3fbfea9. Commit3bb4ce72 only reverts verification-map prose; product/build inputs unchanged. macOS Chrome, two real Agent Server1.58.1 and Automation1.26.0 stacks at localhost18820/18830. No mocks, no model credentials, fixtures INACTIVE with zero runs. Production remains Automation1.25.1; it intentionally hides tag editing through capability detection.

- tag-added.jpg: tag persisted on QA B automation.
- tag-editor.jpg: native editor with removable tag on B backend.
- tag-filter-other-backend.jpg: A active, all servers selected, tag existing only on B selected; only B card remains.
- tag-removed.jpg: saved removal, B remains inactive and has no activity.

These are synthetic fixtures only. No production data or credentials are included.

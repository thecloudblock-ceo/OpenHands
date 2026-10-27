vi.unmock("react-i18next");
import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import i18n from "i18next";
import { renderWithProviders } from "../../test-utils";
import { translationResources } from "#/i18n/resources";
import { AutomationSections } from "#/components/features/automations/automation-sections";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { resetTestHandlersMockSettings } from "#/mocks/settings-handlers";
import { server } from "#/mocks/node";
import AutomationSectionsService from "#/api/automation-sections-service";
import type { Automation } from "#/types/automation";
import type { Backend } from "#/api/backend-registry/types";

const backend: Backend = {
  id: "sections-a",
  name: "Sections A",
  host: "http://localhost:8000",
  apiKey: "test-key",
  kind: "local",
};
const automation: Automation = {
  id: "auto-a",
  name: "Daily health",
  prompt: "Check health",
  trigger: { type: "cron", schedule: "0 9 * * *" },
  enabled: true,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
const actions = {
  onToggle: vi.fn(),
  onRunNow: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
};

function renderSections(view: "list" | "grid" = "list", filtered = false) {
  return renderWithProviders(
    <ActiveBackendProvider>
      <AutomationSections
        automations={[automation]}
        view={view}
        filtered={filtered}
        {...actions}
      />
    </ActiveBackendProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetActiveStoreForTests();
  resetTestHandlersMockSettings();
  setRegisteredBackends([backend]);
  setActiveSelection({ backendId: backend.id });
  i18n.addResourceBundle(
    "en",
    "openhands",
    translationResources.en,
    true,
    true,
  );
  vi.clearAllMocks();
});
afterEach(() => __resetActiveStoreForTests());

async function createSection(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const button = await screen.findByRole("button", { name: "Create section" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await user.type(screen.getByLabelText("Section name"), name);
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

describe("automation sections in the dashboard", () => {
  it("creates, moves, renames and collapses; a fresh browser cache restores server state", async () => {
    const user = userEvent.setup();
    const first = renderSections();
    await createSection(user, "Infrastructure");
    await user.click(
      within(screen.getByRole("region", { name: "Unassigned" })).getByRole(
        "button",
        { name: "Automation actions" },
      ),
    );
    await user.click(screen.getByText("Move to section"));
    const section = Object.keys(
      (await AutomationSectionsService.read(backend)).sections,
    )[0];
    await user.selectOptions(screen.getByLabelText("Section"), section);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("region", { name: "Infrastructure" })).getByText(
        "Daily health",
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Rename Infrastructure" }),
    );
    await user.clear(screen.getByLabelText("Section name"));
    await user.type(screen.getByLabelText("Section name"), "Operations");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /^Operations/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Operations/ }),
      ).toHaveAttribute("aria-expanded", "false"),
    );
    first.unmount();
    renderSections("grid");
    expect(
      await screen.findByRole("button", { name: /^Operations/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Daily health")).not.toBeVisible();
    expect(actions.onToggle).not.toHaveBeenCalled();
    expect(actions.onRunNow).not.toHaveBeenCalled();
  });

  it("keeps automations when a section is deleted, including assignments outside the loaded page", async () => {
    const id = crypto.randomUUID();
    await AutomationSectionsService.update(backend, {
      type: "create",
      id,
      name: "Infrastructure",
    });
    for (const automationId of [automation.id, "unloaded-auto"])
      await AutomationSectionsService.update(backend, {
        type: "assign",
        automationId,
        sectionId: id,
      });
    const user = userEvent.setup();
    renderSections("grid");
    await user.click(
      await screen.findByRole("button", {
        name: "Delete section Infrastructure",
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Infrastructure" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("region", { name: "Unassigned" })).getByText(
        "Daily health",
      ),
    ).toBeVisible();
    expect(actions.onDelete).not.toHaveBeenCalled();
    const persisted = await AutomationSectionsService.read(backend);
    expect(persisted.assignments["unloaded-auto"]).toBe(id);
    expect(persisted.sections[id].deleted).toBe(true);
  });

  it("keeps a failed edit open and offers recovery when sections cannot be read", async () => {
    const user = userEvent.setup();
    const view = renderSections();
    await createSection(user, "Infrastructure");
    server.use(
      http.patch("*/api/settings", () =>
        HttpResponse.json({ detail: "offline" }, { status: 503 }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Rename Infrastructure" }),
    );
    await user.clear(screen.getByLabelText("Section name"));
    await user.type(screen.getByLabelText("Section name"), "Operations");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Infrastructure" }),
    ).toBeInTheDocument();
    view.unmount();
    server.use(
      http.get("*/api/settings", () => HttpResponse.json({}, { status: 503 })),
    );
    renderSections();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load sections",
    );
    expect(screen.getByText("Daily health")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create section" }),
    ).toBeDisabled();
  });

  it("shows a search match inside a collapsed section and isolates backend switches", async () => {
    const id = crypto.randomUUID();
    await AutomationSectionsService.update(backend, {
      type: "create",
      id,
      name: "Infrastructure",
    });
    await AutomationSectionsService.update(backend, {
      type: "assign",
      automationId: automation.id,
      sectionId: id,
    });
    await AutomationSectionsService.update(backend, {
      type: "collapse",
      id,
      collapsed: true,
    });
    server.use(
      http.get("http://other.example/api/settings", () =>
        HttpResponse.json({
          agent_settings: { mcp_config: {} },
          conversation_settings: {},
          misc_settings: {},
          llm_api_key_is_set: false,
        }),
      ),
    );
    renderSections("list", true);
    expect(
      await screen.findByRole("region", { name: "Infrastructure" }),
    ).toBeVisible();
    expect(screen.getByText("Daily health")).toBeVisible();
    await act(async () => {
      setRegisteredBackends([
        backend,
        { ...backend, id: "sections-b", host: "http://other.example" },
      ]);
      setActiveSelection({ backendId: "sections-b" });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Infrastructure" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("region", { name: "Unassigned" }),
    ).toBeVisible();
    expect(
      (await AutomationSectionsService.read(backend)).sections[id].collapsed,
    ).toBe(true);
  });
});

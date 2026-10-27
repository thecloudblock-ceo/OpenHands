vi.unmock("react-i18next");
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../test-utils";
import { translationResources } from "#/i18n/resources";
import AllAutomations from "#/routes/all-automations";
import AutomationsDashboard from "#/routes/automations-dashboard";
import App from "#/root";
import MainApp from "#/routes/root-layout";
import { createRoutesStub } from "react-router";
import { ONBOARDING_COMPLETED_STORAGE_KEY } from "#/components/features/onboarding/use-onboarding-completion";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  getActiveBackend,
  setRegisteredBackends,
  setActiveSelection,
} from "#/api/backend-registry/active-store";
import { server } from "#/mocks/node";
import type { Backend } from "#/api/backend-registry/types";
import type { Automation } from "#/types/automation";

const nodes: Backend[] = ["A", "B"].map((name) => ({
  id: name,
  name: `Node ${name}`,
  kind: "local",
  host: `http://node-${name.toLowerCase()}.test`,
  apiKey: `key-${name}`,
}));
const automation: Automation = {
  id: "shared-id",
  name: "Daily health",
  prompt: "Check health",
  trigger: { type: "cron", schedule: "0 9 * * *", timezone: "Europe/Lisbon" },
  enabled: true,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
let records: Record<string, Automation>;
let settings: Record<string, Record<string, unknown>>;
let sectionWrites: string[];
let writes: { node: string; method: string; body: unknown }[];
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("openhands-automations-view", "list");
  __resetActiveStoreForTests();
  setRegisteredBackends(nodes);
  setActiveSelection({ backendId: "A" });
  i18n.addResourceBundle(
    "en",
    "openhands",
    translationResources.en,
    true,
    true,
  );
  records = { A: structuredClone(automation), B: structuredClone(automation) };
  writes = [];
  settings = { A: {}, B: {} };
  sectionWrites = [];
  for (const node of nodes)
    server.use(
      http.get(`${node.host}/api/settings`, () =>
        HttpResponse.json({ misc_settings: settings[node.id] }),
      ),
      http.patch(`${node.host}/api/settings`, async ({ request }) => {
        const { misc_settings_diff: patch } = (await request.json()) as {
          misc_settings_diff: Record<string, unknown>;
        };
        mergeSettings(settings[node.id], patch);
        sectionWrites.push(node.id);
        return HttpResponse.json({ misc_settings: settings[node.id] });
      }),
      http.all(`${node.host}/api/automation/*`, async ({ request }) => {
        if (
          request.method === "GET" &&
          new URL(request.url).pathname.endsWith("/drafts")
        )
          return HttpResponse.json({ drafts: [], total: 0 });
        if (
          request.method === "GET" &&
          new URL(request.url).pathname.endsWith("/runs")
        )
          return HttpResponse.json({ runs: [], total: 0 });
        if (request.method === "GET")
          return HttpResponse.json({
            automations: [records[node.id]],
            total: 1,
          });
        const body = request.method === "PATCH" ? await request.json() : null;
        writes.push({ node: node.id, method: request.method, body });
        if (body) Object.assign(records[node.id], body);
        return HttpResponse.json(records[node.id]);
      }),
    );
});
afterEach(() => __resetActiveStoreForTests());
function mount() {
  return renderWithProviders(
    <ActiveBackendProvider>
      <AllAutomations />
    </ActiveBackendProvider>,
  );
}

it("runs and toggles the originating server, and opens the complete editor there", async () => {
  const navigate = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <ActiveBackendProvider>
      <AllAutomations />
    </ActiveBackendProvider>,
    { navigation: { currentPath: "/automations/all", navigate } },
  );
  const a = await rowFor("Node A");
  const b = await rowFor("Node B");
  await b.findByText("Daily health");
  await a.findByText("Daily health");
  act(() => setActiveSelection({ backendId: "B" }));
  act(() => setActiveSelection({ backendId: "A" }));
  await user.click(b.getByRole("button", { name: "Run now" }));
  await user.click(b.getByRole("button", { name: "Automation actions" }));
  await user.click(screen.getByText("Turn off", { exact: true }));
  await waitFor(() => expect(records.B.enabled).toBe(false));
  await user.click(b.getByRole("button", { name: "Automation actions" }));
  await user.click(screen.getByText("Turn on", { exact: true }));
  await waitFor(() => expect(records.B.enabled).toBe(true));
  expect(writes.map(({ node, method }) => ({ node, method }))).toEqual([
    { node: "B", method: "POST" },
    { node: "B", method: "PATCH" },
    { node: "B", method: "PATCH" },
  ]);
  expect(getActiveBackend().backend.id).toBe("A");
  await user.click(b.getByRole("button", { name: "Automation actions" }));
  await user.click(screen.getByText("Edit", { exact: true }));
  expect(getActiveBackend().backend.id).toBe("B");
  expect(navigate).toHaveBeenCalledWith(
    "/automations/setup?automationId=shared-id&backend=B",
  );
});

it("keeps healthy nodes usable, loads every page, and retries a failed server", async () => {
  let offline = true;
  server.use(
    http.get(`${nodes[0].host}/api/automation/v1`, () =>
      offline
        ? new HttpResponse(null, { status: 503 })
        : HttpResponse.json({ automations: [], total: 0 }),
    ),
    http.get(`${nodes[1].host}/api/automation/v1`, ({ request }) =>
      HttpResponse.json({
        automations: [
          new URL(request.url).searchParams.get("offset") === "0"
            ? automation
            : { ...automation, id: "later", name: "Later automation" },
        ],
        total: 2,
      }),
    ),
  );
  const user = userEvent.setup();
  mount();
  const failure = await screen.findByRole("alert");
  expect(within(failure).getByLabelText("Server: Node A")).toBeVisible();
  const b = await rowFor("Node B");
  await screen.findByText("Later automation");
  expect(b.getAllByRole("button", { name: "Run now" })[0]).toBeEnabled();
  offline = false;
  await user.click(within(failure).getByRole("button", { name: /retry/i }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

it("does not retarget an open delete confirmation after the server connection changes", async () => {
  const user = userEvent.setup();
  mount();
  const b = await rowFor("Node B");
  await b.findByText("Daily health");
  await user.click(b.getByRole("button", { name: "Automation actions" }));
  await user.click(screen.getByText("Delete", { exact: true }));
  act(() =>
    setRegisteredBackends([
      nodes[0],
      { ...nodes[1], connectionRevision: 1, apiKey: "changed" },
    ]),
  );
  await (await rowFor("Node B")).findByText("Daily health");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(writes).toEqual([]);
});

it.each(["/automations", "/automations/all"])(
  "shows healthy nodes through the full app shell at %s while the selected node bootstrap is pending",
  async (path) => {
    localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/server_info", async () => {
        await held;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const AppRoutes = createRoutesStub([
      {
        path: "/",
        Component: App,
        children: [
          {
            Component: MainApp,
            children: [
              { path: "automations/all", Component: AllAutomations },
              { path: "automations", Component: AutomationsDashboard },
            ],
          },
        ],
      },
    ]);
    const result = renderWithProviders(
      <ActiveBackendProvider>
        <AppRoutes initialEntries={[path]} />
      </ActiveBackendProvider>,
    );
    try {
      expect(
        await (await rowFor("Node B")).findByText("Daily health"),
      ).toBeVisible();
    } finally {
      release();
      result.unmount();
    }
  },
);

it("defaults the dashboard to all servers, labels each row and filters without changing the action target", async () => {
  const user = userEvent.setup();
  const Routes = createRoutesStub([
    { path: "/automations", Component: AutomationsDashboard },
  ]);
  renderWithProviders(
    <ActiveBackendProvider>
      <Routes initialEntries={["/automations"]} />
    </ActiveBackendProvider>,
  );
  const a = await rowFor("Node A");
  const b = await rowFor("Node B");
  await a.findByText("Daily health");
  await b.findByText("Daily health");
  await user.click(screen.getByTestId("automations-view-toggle"));
  await user.click(screen.getByTestId("automations-view-toggle-list"));
  expect(b.getByLabelText("Server: Node B")).toBeVisible();
  const filter = screen.getByRole("combobox", { name: "Server" });
  await user.selectOptions(filter, "B");
  expect(
    screen
      .getAllByRole("listitem")
      .every((row) => !within(row).queryByLabelText("Server: Node A")),
  ).toBe(true);
  expect(getActiveBackend().backend.id).toBe("A");
  await user.click(b.getByRole("button", { name: "Automation actions" }));
  await user.click(screen.getByText("Turn off", { exact: true }));
  await waitFor(() =>
    expect(writes).toEqual([
      { node: "B", method: "PATCH", body: { enabled: false } },
    ]),
  );
  expect(b.getByRole("link", { name: /Daily health/ })).toHaveAttribute(
    "href",
    "/automations/shared-id?backend=B",
  );
  await user.selectOptions(filter, "all");
  expect((await rowFor("Node A")).getByText("Daily health")).toBeVisible();
});

async function rowFor(name: string) {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create section" }),
    ).toBeEnabled(),
  );
  let row: HTMLElement | undefined;
  await waitFor(() => {
    row = screen
      .getAllByRole("listitem")
      .find((item) => within(item).queryByLabelText(`Server: ${name}`));
    expect(row).toBeDefined();
  });
  return within(row!);
}

it("mixes servers in one list and offers one shared section controller", async () => {
  mount();
  await rowFor("Node A");
  await rowFor("Node B");
  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0].parentElement).toBe(rows[1].parentElement);
  expect(
    screen.queryByRole("heading", { name: "Node A" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Node B" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Create section" }),
  ).toHaveLength(1);
});

function mergeSettings(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      target[key] ??= {};
      mergeSettings(
        target[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else target[key] = value;
  }
}

it("shares migrated sections, moves duplicate native IDs independently, and retains edits across filters and reloads", async () => {
  const user = userEvent.setup();
  for (const node of nodes)
    settings[node.id] = {
      unrelated: { keep: true },
      canvas_automation_sections: {
        version: 1,
        sections: {
          [`legacy-${node.id}`]: {
            name: "Operations",
            createdAt: 1,
            collapsed: false,
            deleted: false,
          },
        },
        assignments: node.id === "A" ? { "shared-id": "legacy-A" } : {},
      },
    };
  const originalSettings = structuredClone(settings);
  const first = mount();
  await rowFor("Node B");
  const section = await screen.findByRole("region", { name: "Operations" });
  expect(within(section).getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getAllByRole("region", { name: "Operations" })).toHaveLength(1);
  // Assign server B's identically named/identified automation to the shared section.
  await user.click(
    (await rowFor("Node B")).getByRole("button", {
      name: "Automation actions",
    }),
  );
  await user.click(screen.getByText("Move to section", { exact: true }));
  await user.selectOptions(
    within(screen.getByRole("dialog")).getByRole("combobox"),
    within(screen.getByRole("dialog")).getByRole("option", {
      name: "Operations",
    }),
  );
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
  );
  await waitFor(() =>
    expect(within(section).getAllByRole("listitem")).toHaveLength(2),
  );
  act(() => setActiveSelection({ backendId: "B" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Server" }),
    "B",
  );
  await user.click(screen.getByRole("button", { name: "Rename Operations" }));
  await user.clear(screen.getByRole("textbox", { name: "Section name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Section name" }),
    "Maintenance",
  );
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
  );
  await screen.findByRole("region", { name: "Maintenance" });
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Server" }),
    "all",
  );
  first.unmount();
  mount();
  const reloaded = await screen.findByRole("region", { name: "Maintenance" });
  await waitFor(() =>
    expect(within(reloaded).getAllByRole("listitem")).toHaveLength(2),
  );
  expect(sectionWrites).toEqual(["A", "A"]);
  expect(settings.B).toEqual(originalSettings.B);
  expect(settings.A.canvas_automation_sections).toEqual(
    originalSettings.A.canvas_automation_sections,
  );
  expect(settings.A.unrelated).toEqual({ keep: true });
  expect(writes).toEqual([]);
});

it("keeps all automation actions available when shared section storage fails", async () => {
  server.use(
    http.get(
      `${nodes[0].host}/api/settings`,
      () => new HttpResponse(null, { status: 503 }),
    ),
  );
  const user = userEvent.setup();
  mount();
  await screen.findByRole("alert");
  const row = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByLabelText("Server: Node B"))!;
  await user.click(within(row).getByRole("button", { name: "Run now" }));
  await waitFor(() =>
    expect(writes).toEqual([{ node: "B", method: "POST", body: null }]),
  );
  expect(sectionWrites).toEqual([]);
  expect(screen.getByRole("button", { name: "Create section" })).toBeDisabled();
});

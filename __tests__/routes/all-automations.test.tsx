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
let writes: { node: string; method: string; body: unknown }[];
beforeEach(() => {
  localStorage.clear();
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
  for (const node of nodes)
    server.use(
      http.all(`${node.host}/api/automation/*`, async ({ request }) => {
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

it("runs, pauses, enables and edits the origin node with duplicate IDs and a changed selection", async () => {
  const user = userEvent.setup();
  mount();
  const a = within(screen.getByRole("region", { name: "Node A" }));
  const b = within(screen.getByRole("region", { name: "Node B" }));
  await b.findByText("Daily health");
  await a.findByText("Daily health");
  expect(b.getByRole("link", { name: "Daily health" })).toHaveAttribute(
    "href",
    "/automations/shared-id?backend=B",
  );
  await user.click(b.getByRole("button", { name: "Edit" }));
  const name = screen.getByLabelText("Name");
  await user.clear(name);
  await user.type(name, "Node B renamed");
  act(() => setActiveSelection({ backendId: "B" }));
  act(() => setActiveSelection({ backendId: "A" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await b.findByText("Node B renamed");
  expect(a.getByText("Daily health")).toBeVisible();
  await user.click(b.getByRole("button", { name: "Turn off" }));
  await b.findByRole("button", { name: "Turn on" });
  await user.click(b.getByRole("button", { name: "Turn on" }));
  await b.findByRole("button", { name: "Turn off" });
  await user.click(b.getByRole("button", { name: "Run now" }));
  await waitFor(() =>
    expect(writes).toEqual([
      { node: "B", method: "PATCH", body: { name: "Node B renamed" } },
      { node: "B", method: "PATCH", body: { enabled: false } },
      { node: "B", method: "PATCH", body: { enabled: true } },
      { node: "B", method: "POST", body: null },
    ]),
  );
  await user.click(b.getByRole("link", { name: "Node B renamed" }));
  expect(getActiveBackend().backend.id).toBe("B");
});

it("keeps healthy nodes usable when another fails, paginates, filters and retries independently", async () => {
  let offline = true;
  server.use(
    http.get(`${nodes[0].host}/api/automation/*`, () =>
      offline
        ? new HttpResponse(null, { status: 503 })
        : HttpResponse.json({ automations: [], total: 0 }),
    ),
    http.get(`${nodes[1].host}/api/automation/*`, ({ request }) =>
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
  const a = within(screen.getByRole("region", { name: "Node A" }));
  const b = within(screen.getByRole("region", { name: "Node B" }));
  await a.findByRole("alert");
  await b.findByText("Daily health");
  expect(b.getByRole("button", { name: "Run now" })).toBeEnabled();
  await user.click(b.getByRole("button", { name: "Load more" }));
  await b.findByText("Later automation");
  await user.type(screen.getByRole("textbox", { name: /Search/ }), "Later");
  expect(b.queryByText("Daily health")).not.toBeInTheDocument();
  expect(b.getByText("Later automation")).toBeVisible();
  offline = false;
  await user.click(a.getByRole("button", { name: /retry/i }));
  await waitFor(() => expect(a.queryByRole("alert")).not.toBeInTheDocument());
});

it("retains failed edits for retry and closes the editor when its backend connection changes", async () => {
  let fail = true;
  server.use(
    http.patch(`${nodes[1].host}/api/automation/*`, async ({ request }) => {
      if (fail)
        return HttpResponse.json(
          { detail: "Invalid schedule" },
          { status: 422 },
        );
      Object.assign(records.B, await request.json());
      return HttpResponse.json(records.B);
    }),
  );
  const user = userEvent.setup();
  mount();
  const b = within(screen.getByRole("region", { name: "Node B" }));
  await b.findByText("Daily health");
  await user.click(b.getByRole("button", { name: "Edit" }));
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Preserved draft");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await within(screen.getByRole("dialog")).findByRole("alert");
  expect(screen.getByLabelText("Name")).toHaveValue("Preserved draft");
  fail = false;
  await user.click(screen.getByRole("button", { name: "Save" }));
  await b.findByText("Preserved draft");
  await user.click(b.getByRole("button", { name: "Edit" }));
  act(() =>
    setRegisteredBackends([
      nodes[0],
      { ...nodes[1], connectionRevision: 1, apiKey: "changed" },
    ]),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("shows healthy nodes through the full app shell while the selected node bootstrap is still pending", async () => {
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
          children: [{ path: "automations/all", Component: AllAutomations }],
        },
      ],
    },
  ]);
  const result = renderWithProviders(
    <ActiveBackendProvider>
      <AppRoutes initialEntries={["/automations/all"]} />
    </ActiveBackendProvider>,
  );
  try {
    expect(
      await within(
        await screen.findByRole("region", { name: "Node B" }),
      ).findByText("Daily health"),
    ).toBeVisible();
  } finally {
    release();
    result.unmount();
  }
});

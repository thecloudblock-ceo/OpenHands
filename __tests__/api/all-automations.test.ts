import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import AutomationService from "#/api/automation-service/automation-service.api";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

const first: Backend = {
  id: "node-a",
  name: "Node A",
  kind: "local",
  host: "http://node-a.test",
  apiKey: "key-a",
};
const second: Backend = {
  id: "node-b",
  name: "Node B",
  kind: "local",
  host: "http://node-b.test",
  apiKey: "key-b",
};

beforeEach(() => {
  setRegisteredBackends([first, second]);
  setActiveSelection({ backendId: first.id });
});

describe("explicit automation backend targets", () => {
  it("pins histories, saved drafts and deletion to the requested node", async () => {
    const calls: Array<{ path: string; key: string | null; method: string }> =
      [];
    server.use(
      http.all("http://node-b.test/api/automation/*", ({ request }) => {
        const path = new URL(request.url).pathname;
        calls.push({
          path,
          key: request.headers.get("X-Session-API-Key"),
          method: request.method,
        });
        if (request.method === "DELETE")
          return new HttpResponse(null, { status: 204 });
        if (path.endsWith("/drafts"))
          return HttpResponse.json({ drafts: [], total: 0 });
        if (path.endsWith("/runs"))
          return HttpResponse.json({ runs: [], total: 0 });
        return HttpResponse.json({ id: "run" });
      }),
    );
    await AutomationService.getAutomationRuns("same-id", 20, 0, second);
    await AutomationService.listServerDrafts({}, second);
    await AutomationService.dispatchServerDraft("draft-id", {}, second);
    await AutomationService.deleteServerDraft("draft-id", second);
    await AutomationService.deleteAutomation("same-id", second);
    expect(calls).toEqual([
      { path: "/api/automation/v1/same-id/runs", key: "key-b", method: "GET" },
      { path: "/api/automation/v1/drafts", key: "key-b", method: "GET" },
      {
        path: "/api/automation/v1/drafts/draft-id/dispatch",
        key: "key-b",
        method: "POST",
      },
      {
        path: "/api/automation/v1/drafts/draft-id",
        key: "key-b",
        method: "DELETE",
      },
      { path: "/api/automation/v1/same-id", key: "key-b", method: "DELETE" },
    ]);
  });

  it("lists, pauses, edits and dispatches on the row's node even after active selection changes", async () => {
    const requests: {
      host: string;
      key: string | null;
      method: string;
      body: unknown;
    }[] = [];
    server.use(
      http.all("http://node-b.test/api/automation/*", async ({ request }) => {
        requests.push({
          host: new URL(request.url).host,
          key: request.headers.get("X-Session-API-Key"),
          method: request.method,
          body: request.method === "PATCH" ? await request.json() : null,
        });
        return HttpResponse.json(
          request.method === "GET"
            ? { automations: [], total: 0 }
            : { id: "same-id" },
        );
      }),
    );
    await AutomationService.listAutomations({}, second);
    setActiveSelection({ backendId: second.id });
    const pending = AutomationService.updateAutomation(
      "same-id",
      { enabled: false },
      second,
    );
    setActiveSelection({ backendId: first.id });
    await pending;
    await AutomationService.updateAutomation(
      "same-id",
      { name: "Renamed" },
      second,
    );
    await AutomationService.dispatchAutomation("same-id", second);
    expect(
      requests.map(({ host, key, method }) => ({ host, key, method })),
    ).toEqual(
      ["GET", "PATCH", "PATCH", "POST"].map((method) => ({
        host: "node-b.test",
        key: "key-b",
        method,
      })),
    );
    expect(requests[1].body).toEqual({ enabled: false });
    expect(requests[2].body).toEqual({ name: "Renamed" });
  });

  it("never borrows the active node's key for an unkeyed target and rejects Cloud targets", async () => {
    let key: string | null = "not-called";
    server.use(
      http.get("http://node-b.test/api/automation/*", ({ request }) => {
        key = request.headers.get("X-Session-API-Key");
        return HttpResponse.json({ automations: [], total: 0 });
      }),
    );
    await AutomationService.listAutomations({}, { ...second, apiKey: "" });
    expect(key).toBeNull();
    await expect(
      AutomationService.listAutomations({}, { ...second, kind: "cloud" }),
    ).rejects.toThrow();
  });
});

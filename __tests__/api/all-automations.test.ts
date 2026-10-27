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

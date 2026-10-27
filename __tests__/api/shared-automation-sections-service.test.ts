import { beforeEach, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import type { Backend } from "#/api/backend-registry/types";
import SharedSections, {
  sharedAutomationAssignmentId,
  sharedAutomationSectionsOwner,
} from "#/api/shared-automation-sections-service";
import { getAutomationSectionId } from "#/utils/automation-sections";

const nodes: Backend[] = ["a", "b"].map((id) => ({
  id,
  name: id,
  host: `http://sections-${id}.test`,
  kind: "local",
  apiKey: "test",
}));
let misc: Record<string, Record<string, unknown>>;
let patches: unknown[];
function merge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      target[key] ??= {};
      merge(
        target[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else target[key] = value;
  }
}
beforeEach(() => {
  misc = Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        other: { keep: true },
        canvas_automation_sections: {
          version: 1,
          sections: {
            legacy: {
              name: "Operations",
              createdAt: 1,
              collapsed: false,
              deleted: false,
            },
          },
          assignments: { same: "legacy", unseen: "legacy" },
          unassignedCollapsed: true,
        },
      },
    ]),
  );
  patches = [];
  for (const node of nodes)
    server.use(
      http.get(`${node.host}/api/settings`, () =>
        HttpResponse.json({ misc_settings: misc[node.id] }),
      ),
      http.patch(`${node.host}/api/settings`, async ({ request }) => {
        const patch = (await request.json()) as {
          misc_settings_diff: Record<string, unknown>;
        };
        patches.push({ node: node.id, ...patch });
        merge(misc[node.id], patch.misc_settings_diff);
        return HttpResponse.json({ misc_settings: misc[node.id] });
      }),
    );
});

it("imports once, keeps assignments stable across browser IDs and key rotation, and never resurrects a deleted shared section", async () => {
  const before = structuredClone(misc);
  const initial = await SharedSections.read(nodes[0], nodes);
  expect(Object.keys(initial.sections)).toHaveLength(1);
  const id = Object.keys(initial.sections)[0];
  expect(initial.unassignedCollapsed).toBe(true);
  expect(
    getAutomationSectionId(
      initial,
      sharedAutomationAssignmentId(nodes[1], "same"),
    ),
  ).toBe(id);
  expect(patches).toEqual([]);
  await SharedSections.update(nodes[0], nodes, {
    type: "rename",
    id,
    name: "Maintenance",
  });
  const otherBrowser = nodes.map((node) => ({
    ...node,
    id: `${node.id}-new`,
    apiKey: "rotated",
    connectionRevision: 2,
  }));
  const reload = await SharedSections.read(otherBrowser[0], otherBrowser);
  expect(reload.sections[id].name).toBe("Maintenance");
  expect(
    getAutomationSectionId(
      reload,
      sharedAutomationAssignmentId(otherBrowser[1], "unseen"),
    ),
  ).toBe(id);
  await SharedSections.update(nodes[0], nodes, { type: "delete", id });
  const removed = await SharedSections.read(nodes[0], nodes);
  expect(
    Object.values(removed.sections).every((section) => section.deleted),
  ).toBe(true);
  expect(
    getAutomationSectionId(
      removed,
      sharedAutomationAssignmentId(nodes[1], "same"),
    ),
  ).toBeNull();
  expect(misc.b).toEqual(before.b);
  expect(misc.a.canvas_automation_sections).toEqual(
    before.a.canvas_automation_sections,
  );
  expect(misc.a.other).toEqual({ keep: true });
});

it("retries an unavailable legacy server later and preserves explicit assignments and unloaded rows", async () => {
  let offline = true;
  server.use(
    http.get(`${nodes[1].host}/api/settings`, () =>
      offline
        ? new HttpResponse(null, { status: 503 })
        : HttpResponse.json({ misc_settings: misc.b }),
    ),
  );
  await SharedSections.update(nodes[0], nodes, {
    type: "create",
    id: "shared",
    name: "Shared",
  });
  const key = sharedAutomationAssignmentId(nodes[1], "same");
  await SharedSections.update(nodes[0], nodes, {
    type: "assign",
    automationId: key,
    sectionId: "shared",
  });
  offline = false;
  const restored = await SharedSections.read(nodes[0], nodes);
  expect(getAutomationSectionId(restored, key)).toBe("shared");
  expect(
    getAutomationSectionId(
      restored,
      sharedAutomationAssignmentId(nodes[1], "unseen"),
    ),
  ).not.toBeNull();
});

it("rejects unavailable or malformed shared storage without writing anywhere or failing over", async () => {
  misc.a.canvas_shared_automation_sections = { version: 99 };
  await expect(
    SharedSections.update(nodes[0], nodes, {
      type: "create",
      id: "test",
      name: "Test",
    }),
  ).rejects.toThrow();
  server.use(
    http.get(
      `${nodes[0].host}/api/settings`,
      () => new HttpResponse(null, { status: 503 }),
    ),
  );
  await expect(SharedSections.read(nodes[0], nodes)).rejects.toThrow();
  expect(patches).toEqual([]);
  const hosting = { ...nodes[1], host: window.location.origin };
  expect(sharedAutomationSectionsOwner([nodes[0], hosting])).toBe(hosting);
});

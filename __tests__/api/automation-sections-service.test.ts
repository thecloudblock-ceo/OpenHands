import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsClient } from "@openhands/typescript-client/clients";
import AutomationSectionsService from "#/api/automation-sections-service";
import type { Backend } from "#/api/backend-registry/types";
import {
  parseAutomationSections,
  getAutomationSectionId,
} from "#/utils/automation-sections";

const backend: Backend = {
  id: "local",
  name: "Local",
  kind: "local",
  host: "http://sections.example",
  apiKey: "test-key",
};
const id = "12345678-1234-4234-8234-123456789abc";
let misc: Record<string, unknown>;
let patches: Record<string, unknown>[];

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
  misc = { app_preferences: { language: "pt" }, other_feature: { keep: true } };
  patches = [];
  vi.spyOn(SettingsClient.prototype, "getSettings").mockImplementation(
    async () => ({
      agent_settings: { mcp_config: {} },
      conversation_settings: {},
      llm_api_key_is_set: false,
      misc_settings: structuredClone(misc),
    }),
  );
  vi.spyOn(SettingsClient.prototype, "updateSettings").mockImplementation(
    async (request) => {
      patches.push(structuredClone(request));
      merge(misc, request.misc_settings_diff!);
      return {
        agent_settings: { mcp_config: {} },
        conversation_settings: {},
        llm_api_key_is_set: false,
        misc_settings: structuredClone(misc),
      };
    },
  );
});

describe("server-backed automation sections", () => {
  it("creates, assigns, renames, collapses and removes a section without changing automation settings", async () => {
    expect((await AutomationSectionsService.read(backend)).sections).toEqual(
      {},
    );
    await AutomationSectionsService.update(backend, {
      type: "create",
      id,
      name: "  Infrastructure  ",
    });
    await AutomationSectionsService.update(backend, {
      type: "assign",
      automationId: "auto-a",
      sectionId: id,
    });
    await AutomationSectionsService.update(backend, {
      type: "rename",
      id,
      name: "Operations",
    });
    await AutomationSectionsService.update(backend, {
      type: "collapse",
      id,
      collapsed: true,
    });
    const saved = await AutomationSectionsService.read(backend);
    expect(saved.sections[id]).toMatchObject({
      name: "Operations",
      collapsed: true,
    });
    expect(getAutomationSectionId(saved, "auto-a")).toBe(id);
    await AutomationSectionsService.update(backend, { type: "delete", id });
    const removed = await AutomationSectionsService.read(backend);
    expect(getAutomationSectionId(removed, "auto-a")).toBeNull();
    expect(misc.app_preferences).toEqual({ language: "pt" });
    expect(misc.other_feature).toEqual({ keep: true });
    expect(
      patches.every(
        (patch) => Object.keys(patch).join() === "misc_settings_diff",
      ),
    ).toBe(true);
  });

  it("saves sparse patches so another browser's assignments and sections survive", async () => {
    await AutomationSectionsService.update(backend, {
      type: "create",
      id,
      name: "Infrastructure",
    });
    await AutomationSectionsService.update(backend, {
      type: "assign",
      automationId: "other-page",
      sectionId: id,
    });
    await AutomationSectionsService.update(backend, {
      type: "assign",
      automationId: "visible",
      sectionId: id,
    });
    await AutomationSectionsService.update(backend, {
      type: "assign",
      automationId: "visible",
      sectionId: null,
    });
    const result = await AutomationSectionsService.read(backend);
    expect(getAutomationSectionId(result, "other-page")).toBe(id);
    expect(getAutomationSectionId(result, "visible")).toBeNull();
    expect(patches.at(-1)).toEqual({
      misc_settings_diff: {
        canvas_automation_sections: {
          version: 1,
          assignments: { visible: null },
        },
      },
    });
  });

  it("refuses duplicate names and assigning to deleted sections", async () => {
    await AutomationSectionsService.update(backend, {
      type: "create",
      id,
      name: "Infrastructure",
    });
    await expect(
      AutomationSectionsService.update(backend, {
        type: "create",
        id: "12345678-1234-4234-8234-123456789def",
        name: " infrastructure ",
      }),
    ).rejects.toMatchObject({ code: "duplicate" });
    await AutomationSectionsService.update(backend, { type: "delete", id });
    await expect(
      AutomationSectionsService.update(backend, {
        type: "assign",
        automationId: "a",
        sectionId: id,
      }),
    ).rejects.toMatchObject({ code: "missing" });
  });

  it("does not overwrite malformed or newer data or treat failed reads as empty", async () => {
    misc.canvas_automation_sections = { version: 2 };
    await expect(
      AutomationSectionsService.update(backend, {
        type: "create",
        id,
        name: "Test",
      }),
    ).rejects.toThrow();
    expect(() =>
      parseAutomationSections({ version: 1, sections: { bad: {} } }),
    ).toThrow();
    vi.mocked(SettingsClient.prototype.getSettings).mockRejectedValueOnce(
      new Error("offline"),
    );
    await expect(
      AutomationSectionsService.update(backend, {
        type: "create",
        id,
        name: "Test",
      }),
    ).rejects.toThrow("offline");
    vi.mocked(SettingsClient.prototype.getSettings).mockResolvedValueOnce(
      "<html>Proxy login</html>" as never,
    );
    await expect(AutomationSectionsService.read(backend)).rejects.toThrow();
    expect(patches).toEqual([]);
  });

  it("rejects Cloud without sending a settings request", async () => {
    await expect(
      AutomationSectionsService.read({ ...backend, kind: "cloud" }),
    ).rejects.toThrow();
    expect(SettingsClient.prototype.getSettings).not.toHaveBeenCalled();
  });
});

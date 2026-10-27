import type { Backend } from "#/api/backend-registry/types";
import { isServedOriginHost } from "#/api/agent-server-config";
import AutomationSectionsService, {
  automationSectionsClient,
  readAutomationSectionsState,
} from "./automation-sections-service";
import {
  AutomationSectionsError,
  buildAutomationSectionPatch,
  normalizeSectionName,
  getAutomationSectionId,
  type AutomationSectionsState,
  type AutomationSectionCommand,
} from "#/utils/automation-sections";

export const SHARED_AUTOMATION_SECTIONS_KEY =
  "canvas_shared_automation_sections";
export interface SharedAutomationSectionsState extends AutomationSectionsState {
  importedHosts: Record<string, true>;
}

/** Stable across browser registry IDs, credential rotations and server renames. */
export const automationSectionHost = (backend: Backend) =>
  new URL(backend.host).toString().replace(/\/+$/, "");
export const sharedAutomationAssignmentId = (backend: Backend, id: string) =>
  JSON.stringify([automationSectionHost(backend), id]);

/** Never follow the active server/filter or fail over on a network error. */
export function sharedAutomationSectionsOwner(nodes: Backend[]) {
  return nodes.find((node) => isServedOriginHost(node.host)) ?? nodes[0];
}

function readSharedState(settings: unknown): SharedAutomationSectionsState {
  const state = readAutomationSectionsState(
    settings,
    SHARED_AUTOMATION_SECTIONS_KEY,
  );
  const value = (settings as { misc_settings: Record<string, unknown> })
    .misc_settings[SHARED_AUTOMATION_SECTIONS_KEY] as
    | { importedHosts?: unknown }
    | undefined;
  const importedHosts = value?.importedHosts ?? {};
  if (
    !importedHosts ||
    typeof importedHosts !== "object" ||
    Array.isArray(importedHosts) ||
    Object.entries(importedHosts).some(
      ([host, done]) => !host.startsWith("http") || done !== true,
    )
  )
    throw new AutomationSectionsError("invalid");
  return { ...state, importedHosts: importedHosts as Record<string, true> };
}

/** Only this service writes the shared namespace, on the hosting Canvas backend. */
export default class SharedAutomationSectionsService {
  private static async load(owner: Backend, nodes: Backend[]) {
    const settings = await automationSectionsClient(owner).getSettings();
    const saved = readSharedState(settings);
    const state = structuredClone(saved);
    const isFirstImport = !Object.hasOwn(
      settings.misc_settings ?? {},
      SHARED_AUTOMATION_SECTIONS_KEY,
    );
    let unassignedCollapsed: boolean | undefined;
    // Successful imports are persisted with the next explicit edit. Failed reads
    // stay unimported and are retried; never turn a failed read into an empty import.
    const pending = [
      owner,
      ...nodes
        .filter((node) => node.id !== owner.id)
        .sort((a, b) =>
          automationSectionHost(a).localeCompare(automationSectionHost(b)),
        ),
    ].filter((node) => !state.importedHosts[automationSectionHost(node)]);
    const legacy = await Promise.allSettled(
      pending.map((node) =>
        node.id === owner.id
          ? Promise.resolve().then(() => readAutomationSectionsState(settings))
          : AutomationSectionsService.read(node),
      ),
    );
    const importedSections: AutomationSectionsState["sections"] = {};
    const importedAssignments: AutomationSectionsState["assignments"] = {};
    const importedHosts: Record<string, true> = {};
    legacy.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const node = pending[index];
      const old = result.value;
      if (isFirstImport && node.id === owner.id) {
        unassignedCollapsed = old.unassignedCollapsed;
        state.unassignedCollapsed = old.unassignedCollapsed;
      }
      const ids = new Map<string, string>();
      for (const [id, section] of Object.entries(old.sections)) {
        if (section.deleted) continue;
        const existing = Object.entries(state.sections).find(
          ([, shared]) =>
            !shared.deleted &&
            normalizeSectionName(shared.name).toLowerCase() ===
              normalizeSectionName(section.name).toLowerCase(),
        );
        const sharedId =
          existing?.[0] ?? sharedAutomationAssignmentId(node, id);
        ids.set(id, sharedId);
        if (!Object.hasOwn(state.sections, sharedId)) {
          state.sections[sharedId] = section;
          importedSections[sharedId] = section;
        }
      }
      for (const id of Object.keys(old.assignments)) {
        const key = sharedAutomationAssignmentId(node, id);
        if (Object.hasOwn(state.assignments, key)) continue;
        const oldSection = getAutomationSectionId(old, id);
        const section = oldSection ? (ids.get(oldSection) ?? null) : null;
        state.assignments[key] = section;
        importedAssignments[key] = section;
      }
      importedHosts[automationSectionHost(node)] = true;
      state.importedHosts[automationSectionHost(node)] = true;
    });
    return {
      state,
      patch: {
        version: 1,
        sections: importedSections,
        assignments: importedAssignments,
        importedHosts,
        ...(unassignedCollapsed === undefined ? {} : { unassignedCollapsed }),
      },
    };
  }

  static async read(owner: Backend, nodes: Backend[]) {
    return (await this.load(owner, nodes)).state;
  }

  static async update(
    owner: Backend,
    nodes: Backend[],
    command: AutomationSectionCommand,
  ) {
    const { state, patch } = await this.load(owner, nodes);
    const edit = buildAutomationSectionPatch(state, command);
    const saved = await automationSectionsClient(owner).updateSettings({
      misc_settings_diff: {
        [SHARED_AUTOMATION_SECTIONS_KEY]: {
          ...patch,
          ...edit,
          sections: {
            ...patch.sections,
            ...Object.fromEntries(
              Object.entries(edit.sections ?? {}).map(([id, value]) => [
                id,
                {
                  ...patch.sections[id],
                  ...(value as Record<string, unknown>),
                },
              ]),
            ),
          },
          assignments: {
            ...patch.assignments,
            ...(edit.assignments as object),
          },
        },
      },
    });
    if (
      !saved.misc_settings ||
      !Object.hasOwn(saved.misc_settings, SHARED_AUTOMATION_SECTIONS_KEY)
    )
      throw new AutomationSectionsError("unsupported");
    return readSharedState(saved);
  }
}

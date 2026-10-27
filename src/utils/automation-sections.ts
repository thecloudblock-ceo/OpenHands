/** Canvas-owned presentation data, stored in the server's opaque misc_settings. */
export const AUTOMATION_SECTIONS_SETTINGS_KEY = "canvas_automation_sections";
export const AUTOMATION_SECTION_NAME_MAX_LENGTH = 80;

export interface AutomationSection {
  name: string;
  createdAt: number;
  collapsed: boolean;
  deleted: boolean;
}

export interface AutomationSectionsState {
  version: 1;
  sections: Record<string, AutomationSection>;
  assignments: Record<string, string | null>;
  unassignedCollapsed: boolean;
}

export type AutomationSectionCommand =
  | { type: "create"; id: string; name: string }
  | { type: "rename"; id: string; name: string }
  | { type: "delete"; id: string }
  | { type: "collapse"; id: string | null; collapsed: boolean }
  | { type: "assign"; automationId: string; sectionId: string | null };

export class AutomationSectionsError extends Error {
  constructor(
    public readonly code: "invalid" | "duplicate" | "missing" | "unsupported",
  ) {
    super(`Automation sections: ${code}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(id: string): boolean {
  return (
    id.length > 0 && !["__proto__", "constructor", "prototype"].includes(id)
  );
}

export function normalizeSectionName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function parseAutomationSections(
  value: unknown,
): AutomationSectionsState {
  if (value === undefined) {
    return {
      version: 1,
      sections: {},
      assignments: {},
      unassignedCollapsed: false,
    };
  }
  if (!isRecord(value) || value.version !== 1)
    throw new AutomationSectionsError("unsupported");
  const sections = value.sections ?? {};
  const assignments = value.assignments ?? {};
  if (
    !isRecord(sections) ||
    !isRecord(assignments) ||
    (value.unassignedCollapsed !== undefined &&
      typeof value.unassignedCollapsed !== "boolean")
  ) {
    throw new AutomationSectionsError("invalid");
  }
  for (const [id, section] of Object.entries(sections)) {
    if (
      !validId(id) ||
      !isRecord(section) ||
      typeof section.name !== "string" ||
      !normalizeSectionName(section.name) ||
      section.name.length > AUTOMATION_SECTION_NAME_MAX_LENGTH ||
      typeof section.createdAt !== "number" ||
      !Number.isFinite(section.createdAt) ||
      typeof section.collapsed !== "boolean" ||
      typeof section.deleted !== "boolean"
    ) {
      throw new AutomationSectionsError("invalid");
    }
  }
  for (const [id, sectionId] of Object.entries(assignments)) {
    if (
      !validId(id) ||
      (sectionId !== null &&
        (typeof sectionId !== "string" || !validId(sectionId)))
    ) {
      throw new AutomationSectionsError("invalid");
    }
  }
  return {
    version: 1,
    sections: sections as Record<string, AutomationSection>,
    assignments: assignments as Record<string, string | null>,
    unassignedCollapsed: value.unassignedCollapsed === true,
  };
}

export function getAutomationSectionId(
  state: AutomationSectionsState,
  automationId: string,
): string | null {
  const id = Object.hasOwn(state.assignments, automationId)
    ? state.assignments[automationId]
    : null;
  return id && Object.hasOwn(state.sections, id) && !state.sections[id].deleted
    ? id
    : null;
}

/** Sparse maps preserve unrelated edits and assignments on unloaded pages. */
export function buildAutomationSectionPatch(
  state: AutomationSectionsState,
  command: AutomationSectionCommand,
): Record<string, unknown> {
  const sectionExists = (id: string) =>
    validId(id) &&
    Object.hasOwn(state.sections, id) &&
    !state.sections[id].deleted;
  const requireSection = (id: string) => {
    if (!sectionExists(id)) throw new AutomationSectionsError("missing");
  };
  if (command.type === "assign") {
    if (!validId(command.automationId))
      throw new AutomationSectionsError("invalid");
    if (command.sectionId !== null) requireSection(command.sectionId);
    return {
      version: 1,
      assignments: { [command.automationId]: command.sectionId },
    };
  }
  if (command.type === "collapse" && command.id === null) {
    return { version: 1, unassignedCollapsed: command.collapsed };
  }
  const id = command.id!;
  if (!validId(id)) throw new AutomationSectionsError("invalid");
  if (command.type !== "create") requireSection(id);
  if (command.type === "delete") {
    // A tombstone avoids a delete-vs-assign race and never rewrites all assignments.
    return { version: 1, sections: { [id]: { deleted: true } } };
  }
  if (command.type === "collapse") {
    return { version: 1, sections: { [id]: { collapsed: command.collapsed } } };
  }
  const name = normalizeSectionName(command.name);
  if (!name || name.length > AUTOMATION_SECTION_NAME_MAX_LENGTH)
    throw new AutomationSectionsError("invalid");
  if (
    Object.entries(state.sections).some(
      ([otherId, section]) =>
        otherId !== id &&
        !section.deleted &&
        normalizeSectionName(section.name).toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new AutomationSectionsError("duplicate");
  }
  if (command.type === "create" && Object.hasOwn(state.sections, id))
    throw new AutomationSectionsError("invalid");
  return {
    version: 1,
    sections: {
      [id]:
        command.type === "create"
          ? { name, createdAt: Date.now(), collapsed: false, deleted: false }
          : { name },
    },
  };
}

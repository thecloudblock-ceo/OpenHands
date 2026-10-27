import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import type { Backend } from "#/api/backend-registry/types";
import {
  AUTOMATION_SECTIONS_SETTINGS_KEY,
  AutomationSectionsError,
  buildAutomationSectionPatch,
  parseAutomationSections,
  type AutomationSectionCommand,
} from "#/utils/automation-sections";

function clientFor(backend: Backend): SettingsClient {
  if (backend.kind !== "local")
    throw new AutomationSectionsError("unsupported");
  // Capture host AND key: a backend switch during a request must not retarget it.
  return new SettingsClient(
    getAgentServerClientOptions({
      host: backend.host,
      // Empty string prevents the helper from borrowing another backend's key.
      apiKey: backend.apiKey ?? "",
    }),
  );
}

function readState(settings: unknown) {
  // A proxy/login HTML response must not look like an empty configuration.
  if (
    !settings ||
    typeof settings !== "object" ||
    !("misc_settings" in settings)
  )
    throw new AutomationSectionsError("unsupported");
  const misc = settings.misc_settings;
  if (!misc || typeof misc !== "object" || Array.isArray(misc))
    throw new AutomationSectionsError("unsupported");
  return parseAutomationSections(
    (misc as Record<string, unknown>)[AUTOMATION_SECTIONS_SETTINGS_KEY],
  );
}

/** The sole writer for this namespace; never patches agent/automation settings. */
export default class AutomationSectionsService {
  static async read(backend: Backend) {
    const settings = await clientFor(backend).getSettings();
    return readState(settings);
  }

  static async update(backend: Backend, command: AutomationSectionCommand) {
    const client = clientFor(backend);
    const settings = await client.getSettings();
    const state = readState(settings);
    const patch = buildAutomationSectionPatch(state, command);
    const saved = await client.updateSettings({
      misc_settings_diff: { [AUTOMATION_SECTIONS_SETTINGS_KEY]: patch },
    });
    if (
      !saved.misc_settings ||
      !(AUTOMATION_SECTIONS_SETTINGS_KEY in saved.misc_settings)
    )
      throw new AutomationSectionsError("unsupported");
    return readState(saved);
  }
}

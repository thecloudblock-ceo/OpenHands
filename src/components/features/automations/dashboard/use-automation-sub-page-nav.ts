import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MANIFEST_ICON_BY_SLUG } from "#/components/features/manifest/manifest-icons";
import type { SubPageNavItem } from "#/components/features/manifest/manifest-subpage-layout";
import {
  getInterfaceCopy,
  getSubPagesSpec,
} from "#/manifests/automation-interface";

export interface AutomationSubPageNav {
  heading: string;
  items: SubPageNavItem[];
}

/**
 * The manifest's sub-page navigation resolved for rendering, or null when the
 * manifest declares none.
 */
export function useAutomationSubPageNav(): AutomationSubPageNav | null {
  const { t } = useTranslation("openhands");
  const spec = getSubPagesSpec();
  if (!spec) return null;

  return {
    heading: getInterfaceCopy().sidebarLabel,
    items: [
      ...spec.map((item) => ({
        to: item.to,
        label: item.label,
        // Templates is a catalog, so the host always shows the library icon
        // even while the published manifest still names sparkles.
        Icon:
          item.page === "templates"
            ? MANIFEST_ICON_BY_SLUG.library
            : MANIFEST_ICON_BY_SLUG[item.icon],
        testId: `automations-navigation-${item.page}`,
      })),
      {
        to: "/automations/all",
        label: t(I18nKey.AUTOMATIONS$ALL_AUTOMATIONS),
        Icon: Network,
        testId: "automations-navigation-all",
      },
    ],
  };
}

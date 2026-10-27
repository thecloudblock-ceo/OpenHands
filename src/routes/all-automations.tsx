import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useAutomationSubPageNav } from "#/components/features/automations/dashboard/use-automation-sub-page-nav";
import { ManifestSubpageLayout } from "#/components/features/manifest/manifest-subpage-layout";
import { SearchInput } from "#/components/features/automations/search-input";
import { NodeAutomations } from "#/components/features/automations/node-automations";
import { hasAutomationInterface } from "#/manifests/automation-interface";

export const clientLoader = () => {
  if (!hasAutomationInterface()) throw new Response(null, { status: 404 });
  return null;
};

export default function AllAutomations() {
  const { t } = useTranslation("openhands");
  const { backends } = useActiveBackendContext();
  const nav = useAutomationSubPageNav();
  const [search, setSearch] = useState("");
  const nodes = backends.filter((backend) => backend.kind === "local");
  const content = (
    <>
      <header>
        <h1 className="text-xl font-semibold text-foreground">
          {t(I18nKey.AUTOMATIONS$ALL_AUTOMATIONS)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$ALL_NODES_DESCRIPTION)}
        </p>
      </header>
      <SearchInput value={search} onChange={setSearch} />
      {nodes.length === 0 && (
        <p className="text-sm text-muted">{t(I18nKey.AUTOMATIONS$EMPTY)}</p>
      )}
      {nodes.map((backend) => (
        <NodeAutomations
          key={`${backend.id}:${backend.connectionRevision ?? 0}`}
          backend={backend}
          search={search}
        />
      ))}
      {backends.some((backend) => backend.kind === "cloud") && (
        <p className="text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$LOCAL_NODES_ONLY)}
        </p>
      )}
    </>
  );
  return nav ? (
    <ManifestSubpageLayout
      heading={nav.heading}
      navTestIdBase="automations-navbar"
      items={nav.items}
    >
      {content}
    </ManifestSubpageLayout>
  ) : (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">{content}</main>
  );
}

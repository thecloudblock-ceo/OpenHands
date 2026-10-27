import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useAutomationSubPageNav } from "#/components/features/automations/dashboard/use-automation-sub-page-nav";
import { ManifestSubpageLayout } from "#/components/features/manifest/manifest-subpage-layout";
import { SearchInput } from "#/components/features/automations/search-input";
import { NodeAutomations } from "#/components/features/automations/node-automations";
import { formControlFieldClassName } from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";
import {
  getInterfaceCopy,
  hasAutomationInterface,
} from "#/manifests/automation-interface";

export const clientLoader = () => {
  if (!hasAutomationInterface()) throw new Response(null, { status: 404 });
  return null;
};

const ALL_SERVERS = "all";

export default function AllAutomations({
  dashboard = false,
}: {
  dashboard?: boolean;
}) {
  const { t } = useTranslation("openhands");
  const { backends } = useActiveBackendContext();
  const nav = useAutomationSubPageNav();
  const [search, setSearch] = useState("");
  const filterId = useId();
  const [server, setServer] = useState(ALL_SERVERS);
  const nodes = backends.filter((backend) => backend.kind === "local");
  const selected = nodes.some((node) => node.id === server)
    ? server
    : ALL_SERVERS;
  const visibleNodes = nodes.filter(
    (node) => selected === ALL_SERVERS || node.id === selected,
  );
  const content = (
    <>
      <header>
        <h1 className="text-xl font-semibold text-foreground">
          {dashboard
            ? getInterfaceCopy().listTitle
            : t(I18nKey.AUTOMATIONS$ALL_AUTOMATIONS)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$ALL_NODES_DESCRIPTION)}
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <div className="flex min-w-48 flex-col gap-1">
          <label htmlFor={filterId} className="text-xs font-medium text-muted">
            {t(I18nKey.AUTOMATIONS$SERVER)}
          </label>
          <select
            id={filterId}
            value={selected}
            onChange={(event) => setServer(event.target.value)}
            className={cn(formControlFieldClassName, "max-w-full px-3")}
          >
            <option value={ALL_SERVERS}>
              {t(I18nKey.AUTOMATIONS$ALL_SERVERS)}
            </option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {nodes.length === 0 && (
        <p className="text-sm text-muted">{t(I18nKey.AUTOMATIONS$EMPTY)}</p>
      )}
      {visibleNodes.map((backend) => (
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

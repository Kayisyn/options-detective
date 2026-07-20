// v1.8.1 strategy templates: named Asset Screener filter combinations,
// stored per account under `strategies:<username>` (spec key). Built-in
// presets stay read-only in etfReference — this module only manages the
// user's own saves.
import type { EtfFilters, EtfStrategy } from "../types";

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  strategy: EtfStrategy;
  filters: EtfFilters;
  createdAt: string;
  usageCount: number;
}

const key = (username: string) => `strategies:${username}`;

function isTemplate(x: unknown): x is StrategyTemplate {
  const t = x as StrategyTemplate;
  return !!t && typeof t === "object"
    && typeof t.id === "string" && typeof t.name === "string"
    && typeof t.strategy === "string"
    && !!t.filters && typeof t.filters === "object";
}

export function listTemplates(username: string): StrategyTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(username)) ?? "null");
    return Array.isArray(parsed) ? parsed.filter(isTemplate) : [];
  } catch {
    return [];
  }
}

function persist(username: string, templates: StrategyTemplate[]) {
  try {
    localStorage.setItem(key(username), JSON.stringify(templates));
  } catch {
    // private mode: templates live for the session only
  }
}

export function createTemplate(
  username: string,
  input: { name: string; description: string; strategy: EtfStrategy; filters: EtfFilters },
): StrategyTemplate {
  const template: StrategyTemplate = {
    id: `template-${crypto.randomUUID()}`,
    name: input.name.trim(),
    description: input.description.trim(),
    strategy: input.strategy,
    // deep-copy so later filter edits in the screener can't mutate the save
    filters: JSON.parse(JSON.stringify(input.filters)) as EtfFilters,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  };
  persist(username, [...listTemplates(username), template]);
  return template;
}

export function updateTemplate(
  username: string, id: string, patch: Partial<Pick<StrategyTemplate, "name" | "description">>,
) {
  persist(username, listTemplates(username).map((t) => (
    t.id === id
      ? { ...t,
          name: (patch.name ?? t.name).trim() || t.name,
          description: (patch.description ?? t.description).trim() }
      : t
  )));
}

export function duplicateTemplate(username: string, id: string): StrategyTemplate | null {
  const source = listTemplates(username).find((t) => t.id === id);
  if (!source) return null;
  const copy: StrategyTemplate = {
    ...source,
    id: `template-${crypto.randomUUID()}`,
    name: `${source.name} (copy)`,
    createdAt: new Date().toISOString(),
    usageCount: 0,
    filters: JSON.parse(JSON.stringify(source.filters)) as EtfFilters,
  };
  persist(username, [...listTemplates(username), copy]);
  return copy;
}

export function deleteTemplate(username: string, id: string) {
  persist(username, listTemplates(username).filter((t) => t.id !== id));
}

export function bumpUsage(username: string, id: string) {
  persist(username, listTemplates(username).map((t) => (
    t.id === id ? { ...t, usageCount: (t.usageCount ?? 0) + 1 } : t
  )));
}

// ---- file export/import ----------------------------------------------------

export function downloadTemplates(username: string) {
  const payload = {
    app: "option-obelisk",
    kind: "strategy-templates",
    exportedAt: new Date().toISOString(),
    templates: listTemplates(username),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `option-obelisk-templates-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Merge templates from an exported file. Imported entries get fresh ids so
// they can never clobber existing saves. Returns how many were added.
export function importTemplates(username: string, fileText: string): number {
  const parsed = JSON.parse(fileText) as { kind?: string; templates?: unknown[] };
  if (parsed.kind !== "strategy-templates" || !Array.isArray(parsed.templates)) {
    throw new Error("That file isn't an Option Obelisk template export");
  }
  const incoming = parsed.templates.filter(isTemplate).map((t) => ({
    ...t,
    id: `template-${crypto.randomUUID()}`,
    usageCount: 0,
  }));
  if (incoming.length === 0) return 0;
  persist(username, [...listTemplates(username), ...incoming]);
  return incoming.length;
}

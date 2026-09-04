import {
  BundleBindingSchema,
  type BundleBinding,
  type InstalledAssetsManifest,
} from './contracts';
import { bindingForSelection, type CofofoCatalogSelection } from './Catalog';

export const COFOFO_BUNDLE_BINDING_PATH = '.aidlc/discover/runtime/bundle-binding.json';

export class CofofoBundleBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CofofoBundleBindingError';
  }
}

function filterIds(ids: string[], allowed: Set<string>): string[] {
  return ids.filter((id) => allowed.has(id));
}

function filterMap(
  map: Record<string, string[]>,
  allowed: Set<string>,
): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(map)) {
    const filtered = filterIds(values, allowed);
    if (filtered.length) output[key] = filtered;
  }
  return output;
}

/**
 * Build a deterministic bundle binding from an audited catalog selection and
 * the installed-assets manifest produced by {@link installCatalog}.
 */
export function buildBundleBinding(args: {
  selection: CofofoCatalogSelection;
  installed: InstalledAssetsManifest;
  foundationRevision: number;
}): BundleBinding {
  const { selection, installed, foundationRevision } = args;
  if (installed.catalogRevision !== selection.revision) {
    throw new CofofoBundleBindingError(
      `Installed catalog revision ${installed.catalogRevision} does not match selection ${selection.revision}.`,
    );
  }
  if (installed.foundationRevision > foundationRevision) {
    throw new CofofoBundleBindingError(
      `Installed foundation revision ${installed.foundationRevision} is newer than expected ${foundationRevision}.`,
    );
  }

  const allowed = new Set(selection.assets.map((asset) => asset.id));
  const installedById = new Map(installed.assets.map((asset) => [asset.id, asset]));
  for (const id of allowed) {
    if (!installedById.has(id)) {
      throw new CofofoBundleBindingError(`Installed assets missing catalog id "${id}".`);
    }
  }

  const template = bindingForSelection(selection);
  const roles = filterMap(template.roles, allowed);
  const phases = filterMap(template.phases, allowed);

  const referenced = new Set<string>();
  for (const ids of Object.values(roles)) for (const id of ids) referenced.add(id);
  for (const ids of Object.values(phases)) for (const id of ids) referenced.add(id);

  for (const id of referenced) {
    if (!installedById.has(id)) {
      throw new CofofoBundleBindingError(`Binding references "${id}" which is not installed.`);
    }
  }

  const skills = [...referenced].sort().map((id) => {
    const asset = installedById.get(id)!;
    return {
      id,
      path: asset.installedPath,
      sha256: asset.sha256,
    };
  });

  return BundleBindingSchema.parse({
    schemaVersion: 1,
    foundationRevision,
    stackId: selection.stackId,
    catalogRevision: selection.revision,
    roles,
    phases,
    skills,
    commands: selection.commands.map((command) => ({
      id: command.id,
      executable: command.executable,
      args: command.args,
    })),
  });
}

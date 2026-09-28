/** Tracks the current plugin metadata snapshot for control-plane lookups. */
import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";
import {
  currentPluginMetadataConfigIdentityCache,
  getCurrentPluginMetadataSnapshotState,
  setCurrentPluginMetadataSnapshotState,
  type CurrentPluginMetadataSnapshotRevision,
} from "./current-plugin-metadata-state.js";
import { resolveInstalledPluginIndexPolicyHash } from "./installed-plugin-index-policy.js";
import {
  resolvePluginControlPlaneFingerprint,
  type ResolvePluginControlPlaneContextParams,
} from "./plugin-control-plane-context.js";
import type {
  PluginMetadataSnapshot,
  PluginMetadataSnapshotPluginIdScope,
} from "./plugin-metadata-snapshot.types.js";
import { normalizePluginIdScope, serializePluginIdScope } from "./plugin-scope.js";
import { resolvePluginSourceRoots } from "./roots.js";

type CurrentPluginMetadataSnapshotState = ReturnType<
  typeof getCurrentPluginMetadataSnapshotState
> & {
  configIdentities: WeakSet<OpenClawConfig>;
};

type CurrentPluginMetadataSnapshotOptions = {
  config?: OpenClawConfig;
  compatibleConfigs?: readonly OpenClawConfig[];
  env?: NodeJS.ProcessEnv;
  workspaceDir?: string;
};

type TemporaryPluginMetadataSnapshotLeaseState = {
  parent: TemporaryPluginMetadataSnapshotLeaseState | undefined;
  previousState: CurrentPluginMetadataSnapshotState;
  revision: CurrentPluginMetadataSnapshotRevision;
  released: boolean;
};

type TemporaryPluginMetadataSnapshotLease = {
  release: () => boolean;
};

type CurrentPluginMetadataSnapshotParams = {
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  allowScopedSnapshot?: boolean;
  pluginIds?: readonly string[];
  pluginIdScope?: PluginMetadataSnapshotPluginIdScope;
  workspaceDir?: string;
  allowWorkspaceScopedSnapshot?: boolean;
  requireDefaultDiscoveryContext?: boolean;
};

type PluginMetadataSnapshotCandidate = {
  snapshot: PluginMetadataSnapshot | undefined;
  configFingerprint: string | undefined;
  compatiblePolicyHashes?: readonly string[];
  compatibleConfigFingerprints?: readonly string[];
  hasConfigIdentity?: (config: OpenClawConfig) => boolean;
};

type ScopedPluginMetadataSnapshot = PluginMetadataSnapshotCandidate & {
  parent?: ScopedPluginMetadataSnapshot;
};

export type PluginMetadataSnapshotScopeRunner = <T>(
  params: {
    config: OpenClawConfig;
    workspaceDir?: string;
  },
  run: () => T,
) => T;

let activeTemporaryPluginMetadataSnapshotLease:
  | TemporaryPluginMetadataSnapshotLeaseState
  | undefined;

// Other agent workspaces' snapshots for the current publication revision only.
let workspacePluginMetadataSnapshots:
  | {
      revision: CurrentPluginMetadataSnapshotRevision;
      byWorkspaceDir: Map<
        string,
        { snapshot: PluginMetadataSnapshot; pluginRootSignature: string }
      >;
    }
  | undefined;

const SCOPED_PLUGIN_METADATA_SNAPSHOT_KEY = Symbol.for("openclaw.scopedPluginMetadataSnapshot");
const scopedPluginMetadataSnapshot = resolveGlobalSingleton<
  AsyncLocalStorage<ScopedPluginMetadataSnapshot>
>(SCOPED_PLUGIN_METADATA_SNAPSHOT_KEY, () => new AsyncLocalStorage());

function resolvePluginMetadataControlPlaneFingerprint(
  config?: OpenClawConfig,
  options: Omit<ResolvePluginControlPlaneContextParams, "config"> = {},
): string {
  return resolvePluginControlPlaneFingerprint({
    config,
    ...options,
  });
}

function publishCurrentPluginMetadataSnapshot(
  snapshot: PluginMetadataSnapshot | undefined,
  options: CurrentPluginMetadataSnapshotOptions,
): CurrentPluginMetadataSnapshotRevision {
  currentPluginMetadataConfigIdentityCache.clear();
  const compatiblePolicyHashes = snapshot
    ? options.compatibleConfigs?.map((config) => resolveInstalledPluginIndexPolicyHash(config))
    : undefined;
  const compatibleConfigFingerprints = snapshot
    ? options.compatibleConfigs?.map((config, index) =>
        resolvePluginMetadataControlPlaneFingerprint(config, {
          env: options.env,
          index: snapshot.index,
          policyHash: compatiblePolicyHashes?.[index],
          workspaceDir: options.workspaceDir ?? snapshot.workspaceDir,
        }),
      )
    : undefined;
  const configFingerprint = snapshot
    ? resolvePluginMetadataControlPlaneFingerprint(options.config, {
        env: options.env,
        index: snapshot.index,
        policyHash: snapshot.policyHash,
        workspaceDir: options.workspaceDir ?? snapshot.workspaceDir,
      })
    : undefined;
  const defaultDiscoveryConfigFingerprint = snapshot
    ? resolvePluginMetadataControlPlaneFingerprint(
        {},
        {
          env: options.env,
          index: snapshot.index,
          policyHash: snapshot.policyHash,
          workspaceDir: options.workspaceDir ?? snapshot.workspaceDir,
        },
      )
    : undefined;
  const defaultDiscoveryCompatible =
    snapshot &&
    defaultDiscoveryConfigFingerprint &&
    (configFingerprint === defaultDiscoveryConfigFingerprint ||
      snapshot.configFingerprint === defaultDiscoveryConfigFingerprint ||
      Boolean(compatibleConfigFingerprints?.includes(defaultDiscoveryConfigFingerprint)));
  const revision = setCurrentPluginMetadataSnapshotState(
    snapshot,
    configFingerprint,
    compatiblePolicyHashes,
    compatibleConfigFingerprints,
    defaultDiscoveryCompatible ? snapshot.plugins : undefined,
  );
  if (!snapshot) {
    return revision;
  }
  if (options.config) {
    const policyHash = resolveInstalledPluginIndexPolicyHash(options.config);
    if (
      policyHash === snapshot.policyHash ||
      Boolean(compatiblePolicyHashes?.includes(policyHash))
    ) {
      currentPluginMetadataConfigIdentityCache.add(options.config);
    }
  }
  for (const config of options.compatibleConfigs ?? []) {
    currentPluginMetadataConfigIdentityCache.add(config);
  }
  return revision;
}

// Single-slot Gateway-owned handoff. Replace or clear it at lifecycle boundaries;
// never accumulate historical metadata snapshots here.
export function setCurrentPluginMetadataSnapshot(
  snapshot: PluginMetadataSnapshot | undefined,
  options: CurrentPluginMetadataSnapshotOptions = {},
): void {
  activeTemporaryPluginMetadataSnapshotLease = undefined;
  publishCurrentPluginMetadataSnapshot(snapshot, options);
}

function captureCurrentPluginMetadataSnapshotState(): CurrentPluginMetadataSnapshotState {
  return {
    ...getCurrentPluginMetadataSnapshotState(),
    configIdentities: currentPluginMetadataConfigIdentityCache.capture(),
  };
}

function restoreCapturedCurrentPluginMetadataSnapshotState(
  state: CurrentPluginMetadataSnapshotState,
): CurrentPluginMetadataSnapshotRevision {
  currentPluginMetadataConfigIdentityCache.restore(state.configIdentities);
  return setCurrentPluginMetadataSnapshotState(
    state.snapshot,
    state.configFingerprint,
    state.compatiblePolicyHashes,
    state.compatibleConfigFingerprints,
    state.manifestModelIdNormalizationRecords,
  );
}

function resolveTemporaryPluginMetadataSnapshotLeaseParent():
  | TemporaryPluginMetadataSnapshotLeaseState
  | undefined {
  const active = activeTemporaryPluginMetadataSnapshotLease;
  if (active && getCurrentPluginMetadataSnapshotState().revision !== active.revision) {
    activeTemporaryPluginMetadataSnapshotLease = undefined;
    return undefined;
  }
  return active;
}

function releaseTemporaryPluginMetadataSnapshotLease(
  lease: TemporaryPluginMetadataSnapshotLeaseState,
): boolean {
  if (lease.released) {
    return false;
  }
  lease.released = true;
  if (activeTemporaryPluginMetadataSnapshotLease !== lease) {
    return false;
  }

  let restored = false;
  while (activeTemporaryPluginMetadataSnapshotLease?.released) {
    const current: TemporaryPluginMetadataSnapshotLeaseState =
      activeTemporaryPluginMetadataSnapshotLease;
    if (getCurrentPluginMetadataSnapshotState().revision !== current.revision) {
      activeTemporaryPluginMetadataSnapshotLease = undefined;
      return restored;
    }
    const restoredRevision = restoreCapturedCurrentPluginMetadataSnapshotState(
      current.previousState,
    );
    activeTemporaryPluginMetadataSnapshotLease = current.parent;
    if (activeTemporaryPluginMetadataSnapshotLease) {
      activeTemporaryPluginMetadataSnapshotLease.revision = restoredRevision;
    }
    restored = true;
  }
  return restored;
}

/** Temporarily publishes metadata without restoring over lifecycle-owned replacements. */
export function installTemporaryCurrentPluginMetadataSnapshot(
  snapshot: PluginMetadataSnapshot,
  options: CurrentPluginMetadataSnapshotOptions = {},
): TemporaryPluginMetadataSnapshotLease {
  const lease: TemporaryPluginMetadataSnapshotLeaseState = {
    parent: resolveTemporaryPluginMetadataSnapshotLeaseParent(),
    previousState: captureCurrentPluginMetadataSnapshotState(),
    revision: publishCurrentPluginMetadataSnapshot(snapshot, options),
    released: false,
  };
  activeTemporaryPluginMetadataSnapshotLease = lease;
  return {
    release: () => releaseTemporaryPluginMetadataSnapshotLease(lease),
  };
}

/** Carries one owner-prepared metadata generation through nested async plugin lookups. */
export function withPluginMetadataSnapshotScope<T>(
  snapshot: PluginMetadataSnapshot,
  run: () => T,
  options: CurrentPluginMetadataSnapshotOptions = {},
): T {
  const workspaceDir = options.workspaceDir ?? snapshot.workspaceDir;
  const compatiblePolicyHashes = options.compatibleConfigs?.map((config) =>
    resolveInstalledPluginIndexPolicyHash(config),
  );
  const compatibleConfigFingerprints = options.compatibleConfigs?.map((config, index) =>
    resolvePluginMetadataControlPlaneFingerprint(config, {
      env: options.env,
      index: snapshot.index,
      policyHash: compatiblePolicyHashes?.[index],
      workspaceDir,
    }),
  );
  const configFingerprint = options.config
    ? resolvePluginMetadataControlPlaneFingerprint(options.config, {
        env: options.env,
        index: snapshot.index,
        policyHash: snapshot.policyHash,
        workspaceDir,
      })
    : snapshot.configFingerprint;
  const configIdentities = new WeakSet<OpenClawConfig>();
  if (options.config) {
    const policyHash = resolveInstalledPluginIndexPolicyHash(options.config);
    if (policyHash === snapshot.policyHash || compatiblePolicyHashes?.includes(policyHash)) {
      configIdentities.add(options.config);
    }
  }
  for (const config of options.compatibleConfigs ?? []) {
    configIdentities.add(config);
  }
  return scopedPluginMetadataSnapshot.run(
    {
      snapshot,
      configFingerprint,
      compatiblePolicyHashes,
      compatibleConfigFingerprints,
      hasConfigIdentity: (config) => configIdentities.has(config),
      parent: scopedPluginMetadataSnapshot.getStore(),
    },
    run,
  );
}

function resolveCompatiblePluginMetadataSnapshot(
  candidate: PluginMetadataSnapshotCandidate,
  params: CurrentPluginMetadataSnapshotParams,
  options: { scopedOwnerContext?: boolean } = {},
): PluginMetadataSnapshot | undefined {
  const snapshot = candidate.snapshot;
  if (!snapshot) {
    return undefined;
  }
  const env = params.env ?? process.env;
  const requestedPluginIds = normalizePluginIdScope(
    params.pluginIds ?? params.pluginIdScope?.resolve({ index: snapshot.index }),
  );
  const snapshotPluginIds = normalizePluginIdScope(snapshot.pluginIds);
  if (
    requestedPluginIds !== undefined &&
    serializePluginIdScope(snapshotPluginIds) !== serializePluginIdScope(requestedPluginIds)
  ) {
    return undefined;
  }
  if (
    snapshotPluginIds !== undefined &&
    requestedPluginIds === undefined &&
    params.allowScopedSnapshot !== true
  ) {
    return undefined;
  }
  const requestedWorkspaceDir =
    params.workspaceDir ??
    (params.allowWorkspaceScopedSnapshot === true ? snapshot.workspaceDir : undefined);
  if (snapshot.workspaceDir !== undefined && requestedWorkspaceDir === undefined) {
    return undefined;
  }
  if (
    requestedWorkspaceDir !== undefined &&
    (snapshot.workspaceDir ?? "") !== (requestedWorkspaceDir ?? "")
  ) {
    return undefined;
  }
  const canReuseCachedConfig = Boolean(
    params.config && candidate.hasConfigIdentity?.(params.config),
  );
  if (canReuseCachedConfig && params.requireDefaultDiscoveryContext !== true) {
    return snapshot;
  }
  const requestedPolicyHash =
    params.config && !canReuseCachedConfig
      ? resolveInstalledPluginIndexPolicyHash(params.config)
      : undefined;
  if (requestedPolicyHash && snapshot.policyHash !== requestedPolicyHash) {
    if (!candidate.compatiblePolicyHashes?.includes(requestedPolicyHash)) {
      return undefined;
    }
  }
  if (params.config && !canReuseCachedConfig) {
    const requestedConfigFingerprint = resolvePluginMetadataControlPlaneFingerprint(params.config, {
      env,
      index: snapshot.index,
      policyHash: requestedPolicyHash,
      workspaceDir: requestedWorkspaceDir,
    });
    const fingerprintMatches =
      candidate.configFingerprint === requestedConfigFingerprint ||
      snapshot.configFingerprint === requestedConfigFingerprint ||
      Boolean(candidate.compatibleConfigFingerprints?.includes(requestedConfigFingerprint));
    if (!fingerprintMatches) {
      return undefined;
    }
  }
  if (params.requireDefaultDiscoveryContext === true && options.scopedOwnerContext !== true) {
    const defaultDiscoveryConfigFingerprint = resolvePluginMetadataControlPlaneFingerprint(
      {},
      {
        env: params.env,
        index: snapshot.index,
        policyHash: snapshot.policyHash,
        workspaceDir: requestedWorkspaceDir,
      },
    );
    const fingerprintMatches =
      candidate.configFingerprint === defaultDiscoveryConfigFingerprint ||
      snapshot.configFingerprint === defaultDiscoveryConfigFingerprint ||
      Boolean(candidate.compatibleConfigFingerprints?.includes(defaultDiscoveryConfigFingerprint));
    if (!fingerprintMatches) {
      return undefined;
    }
  }
  return snapshot;
}

export function getCurrentPluginMetadataSnapshot(
  params: CurrentPluginMetadataSnapshotParams = {},
): PluginMetadataSnapshot | undefined {
  for (let scoped = scopedPluginMetadataSnapshot.getStore(); scoped; scoped = scoped.parent) {
    // An explicit async owner scope is the discovery context for nested configless readers.
    // Global snapshots still require proof that they match the default discovery context.
    const compatibleScoped = resolveCompatiblePluginMetadataSnapshot(scoped, params, {
      scopedOwnerContext: true,
    });
    if (compatibleScoped) {
      return compatibleScoped;
    }
  }

  const {
    snapshot,
    configFingerprint,
    compatiblePolicyHashes,
    compatibleConfigFingerprints,
    revision,
  } = getCurrentPluginMetadataSnapshotState();
  const current = resolveCompatiblePluginMetadataSnapshot(
    {
      snapshot: snapshot as PluginMetadataSnapshot | undefined,
      configFingerprint,
      compatiblePolicyHashes,
      compatibleConfigFingerprints,
      hasConfigIdentity: (config) => currentPluginMetadataConfigIdentityCache.has(config),
    },
    params,
  );
  if (current || params.workspaceDir === undefined) {
    return current;
  }
  const entries =
    workspacePluginMetadataSnapshots?.revision === revision
      ? workspacePluginMetadataSnapshots.byWorkspaceDir
      : undefined;
  const entry = entries?.get(params.workspaceDir);
  if (
    entry &&
    entry.pluginRootSignature !== workspacePluginRootSignature(params.workspaceDir, params.env)
  ) {
    // The workspace's own plugins changed since the scan: rescan, as every read did before
    // these entries existed, rather than serve a list missing them.
    entries?.delete(params.workspaceDir);
    return undefined;
  }
  return resolveCompatiblePluginMetadataSnapshot(
    { snapshot: entry?.snapshot, configFingerprint: entry?.snapshot.configFingerprint },
    params,
  );
}

/**
 * A cheap fingerprint of the one plugin source that differs between workspaces: the
 * workspace's own `.openclaw/extensions` folder, its entries, and their manifests. Taken
 * before a workspace is scanned and compared on every reuse of that scan, so a plugin
 * added to, changed in, or removed from that folder is seen by the next read, as it was
 * when every read rescanned. A workspace with no such folder, the usual case, costs one
 * failed `stat`. The shared roots (bundled, global, load paths) keep the lifecycle of the
 * Gateway's own snapshot.
 */
export function workspacePluginRootSignature(
  workspaceDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const root = resolvePluginSourceRoots({ workspaceDir, env }).workspace;
  if (!root) {
    return "";
  }
  try {
    const parts = [String(statSync(root).mtimeMs)];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const child = join(root, entry.name);
      parts.push(`${entry.name}:${statSync(child).mtimeMs}`);
      for (const manifest of ["openclaw.plugin.json", "package.json"]) {
        const mtime = statSync(join(child, manifest), { throwIfNoEntry: false })?.mtimeMs;
        if (mtime !== undefined) {
          parts.push(`${entry.name}/${manifest}:${mtime}`);
        }
      }
    }
    return parts.join("|");
  } catch {
    return "absent";
  }
}

/**
 * Records an unscoped snapshot built for another agent workspace so later readers of that
 * workspace reuse it instead of rediscovering every plugin on disk. Entries belong to the
 * current publication: any new revision (replacement, clear, temporary lease) drops them, and
 * each workspace keeps only its latest snapshot, so this never holds historical generations.
 *
 * `pluginRootSignature` is `workspacePluginRootSignature` taken before the scan, so a plugin
 * added while the scan ran is not hidden behind it.
 */
export function rememberWorkspacePluginMetadataSnapshot(
  snapshot: PluginMetadataSnapshot,
  pluginRootSignature: string,
): void {
  const { snapshot: current, revision } = getCurrentPluginMetadataSnapshotState();
  // Only a Gateway-owned generation has a lifecycle that invalidates these entries.
  if (!current || snapshot.workspaceDir === undefined || snapshot.pluginIds !== undefined) {
    return;
  }
  if (workspacePluginMetadataSnapshots?.revision !== revision) {
    workspacePluginMetadataSnapshots = { revision, byWorkspaceDir: new Map() };
  }
  workspacePluginMetadataSnapshots.byWorkspaceDir.set(snapshot.workspaceDir, {
    snapshot,
    pluginRootSignature,
  });
}

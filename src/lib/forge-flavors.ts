import type { ForgeFlavor, ForgeKind } from '../types/forge';

/**
 * The platforms the UI offers. Forgejo, Codeberg and Gitea share the `gitea` adapter; they differ only in label, default
 * host and the page where a token is created. Brand names are not translated.
 */
export interface FlavorInfo {
  id: ForgeFlavor;
  kind: ForgeKind;
  name: string;
  /** Prefilled address ('' = the user types their own). */
  host: string;
  /** The page of the forge where a token with the right scopes is created (read-only, issues + repository metadata). */
  tokenUrl(host: string): string;
}

export const FLAVORS: readonly FlavorInfo[] = [
  {
    id: 'github',
    kind: 'github',
    name: 'GitHub',
    host: 'https://github.com',
    tokenUrl: (host) =>
      host === 'https://github.com'
        ? 'https://github.com/settings/personal-access-tokens/new?name=Productivist&description=Read+issues&expires_in=90&issues=read'
        : `${host}/settings/tokens/new?scopes=repo&description=Productivist`,
  },
  {
    id: 'gitlab',
    kind: 'gitlab',
    name: 'GitLab',
    host: 'https://gitlab.com',
    tokenUrl: (host) => `${host}/-/user_settings/personal_access_tokens?name=Productivist&scopes=read_api`,
  },
  { id: 'forgejo', kind: 'gitea', name: 'Forgejo', host: '', tokenUrl: (host) => `${host}/user/settings/applications` },
  { id: 'codeberg', kind: 'gitea', name: 'Codeberg', host: 'https://codeberg.org', tokenUrl: (host) => `${host}/user/settings/applications` },
  { id: 'gitea', kind: 'gitea', name: 'Gitea', host: 'https://gitea.com', tokenUrl: (host) => `${host}/user/settings/applications` },
];

/** The flavor to show for a host: a flavor's default host wins, otherwise the one named like the kind. */
export function flavorOf(kind: ForgeKind, host: string): FlavorInfo {
  return FLAVORS.find((f) => f.kind === kind && f.host === host) ?? FLAVORS.find((f) => f.id === kind) ?? FLAVORS[0];
}

/** "GitHub", "Codeberg", ... for a project, milestone or task `source`. */
export const forgeName = (source: { kind: ForgeKind; host: string }): string => flavorOf(source.kind, source.host).name;

/** "owner/name" or "owner/name#42". */
export const forgeRef = (source: { repoPath: string; number?: number }): string =>
  source.number ? `${source.repoPath}#${source.number}` : source.repoPath;

import { Session } from '@inrupt/solid-client-authn-browser';
import { listDerPodNames } from '../config/derWebIds';
import {
  LocalStorageBackend,
  PrefixedLocalStorage,
  SECURE_LOCAL_PREFIX,
} from './persistentSolidStorage';

/** Shared across portal + all pod sessions; keys are namespaced by sessionId so this is safe. */
const sharedInsecureStorage = new LocalStorageBackend();
const sharedSecureStorage = new PrefixedLocalStorage(SECURE_LOCAL_PREFIX);

/** Must match the second argument passed to `new Session(..., PORTAL_SESSION_ID)`. */
export const PORTAL_SESSION_ID = 'solid-portal-utility-v1';

/**
 * Inrupt stores the "active" session id here for silent refresh. Pod login overwrites it with
 * `der-pod:…`, which breaks the next `restorePreviousSession` on the portal Session — call
 * `pinCurrentSessionToPortal()` after a pod OAuth redirect completes, before restoring the portal.
 */
const SOLID_AUTH_CURRENT_SESSION_KEY = 'solidClientAuthn:currentSession';

const PORTAL_SESSION_ID_STORAGE_KEY = 'solidPortalSessionId';

/** Call before redirecting to pod OIDC so we can restore the right id after pod LOGIN overwrites `currentSession`. */
export function rememberPortalSessionIdForRedirect(portalSession: Session): void {
  try {
    const sid = portalSession.info.sessionId;
    if (sid) {
      window.sessionStorage.setItem(PORTAL_SESSION_ID_STORAGE_KEY, sid);
    }
  } catch {
    /* ignore */
  }
}

export function pinCurrentSessionToPortal(): void {
  try {
    const sid =
      window.sessionStorage.getItem(PORTAL_SESSION_ID_STORAGE_KEY) || PORTAL_SESSION_ID;
    window.localStorage.setItem(SOLID_AUTH_CURRENT_SESSION_KEY, sid);
  } catch {
    /* private mode / quota */
  }
}

/**
 * True if this full page load began with OAuth query params (evaluated once per bundle evaluation,
 * before React strips them). Used to avoid calling `restorePreviousSession` on a second effect run
 * (e.g. React Strict Mode) after params were removed — that was hijacking the portal session.
 */
export const oauthReturnOnInitialLoad: boolean =
  typeof window !== 'undefined' &&
  (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.has('code') && p.has('state');
    } catch {
      return false;
    }
  })();

let portalSessionSingleton: Session | undefined;
const podSessionCache = new Map<string, Session>();

export function getPortalSession(): Session {
  if (!portalSessionSingleton) {
    portalSessionSingleton = new Session(
      {
        secureStorage: sharedSecureStorage,
        insecureStorage: sharedInsecureStorage,
      },
      PORTAL_SESSION_ID
    );
  }
  return portalSessionSingleton;
}

/**
 * Isolated Solid session per DER pod (separate from the portal/utility login).
 * Each instance has its own auth storage and fetch binding.
 */
export function getPodSession(podName: string): Session {
  let s = podSessionCache.get(podName);
  if (!s) {
    s = new Session(
      {
        secureStorage: sharedSecureStorage,
        insecureStorage: sharedInsecureStorage,
      },
      `der-pod:${podName}`
    );
    podSessionCache.set(podName, s);
  }
  return s;
}

/** Query param on redirect URL so we complete OIDC on the correct pod Session after login. */
export const POD_CONNECT_QUERY = 'podConnect';

export function buildPortalLoginRedirectUrl(): string {
  const u = new URL(window.location.href);
  u.searchParams.delete(POD_CONNECT_QUERY);
  return u.toString();
}

export function buildPodLoginRedirectUrl(podName: string): string {
  const u = new URL(window.location.href);
  u.searchParams.delete(POD_CONNECT_QUERY);
  u.searchParams.set(POD_CONNECT_QUERY, podName);
  return u.toString();
}

export function hasOAuthRedirectParams(): boolean {
  try {
    const p = new URLSearchParams(new URL(window.location.href).search);
    return p.has('code') && p.has('state');
  } catch {
    return false;
  }
}

/**
 * Remove OAuth redirect query params from the address bar. Required after one Session finishes
 * `handleIncomingRedirect`, before any other Session runs `handleIncomingRedirect` — otherwise the
 * library still passes `window.location.href` with code/state into every session and the portal
 * Session can incorrectly adopt the DER login as its WebID.
 */
export function stripOAuthParamsFromCurrentUrl(): void {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('code') && !u.searchParams.has('state')) {
      return;
    }
    u.searchParams.delete('code');
    u.searchParams.delete('state');
    u.searchParams.delete(POD_CONNECT_QUERY);
    const q = u.searchParams.toString();
    window.history.replaceState({}, '', u.pathname + (q ? `?${q}` : '') + u.hash);
  } catch {
    /* ignore */
  }
}

const userStorageKey = (sessionId: string): string =>
  `solidClientAuthenticationUser:${sessionId}`;

function hasPersistedUserData(sessionId: string): boolean {
  try {
    const base = userStorageKey(sessionId);
    const secureRaw = window.localStorage.getItem(SECURE_LOCAL_PREFIX + base);
    if (secureRaw && secureRaw.length > 3) {
      const o = JSON.parse(secureRaw) as Record<string, unknown>;
      if (o != null && typeof o === 'object' && Object.keys(o).length > 0) {
        return true;
      }
    }
    const raw = window.localStorage.getItem(base);
    if (!raw || raw.length < 3) return false;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return o != null && typeof o === 'object' && Object.keys(o).length > 0;
  } catch {
    return false;
  }
}

/**
 * After the portal session is restored, re-hydrate each DER `Session` that still has tokens in
 * localStorage so multiple pods stay “Connected” across full page reloads.
 */
export async function restorePersistedPodSessions(portalSession: Session): Promise<void> {
  stripOAuthParamsFromCurrentUrl();
  for (const name of listDerPodNames()) {
    const sid = `der-pod:${name}`;
    if (!hasPersistedUserData(sid)) continue;
    try {
      window.localStorage.setItem(SOLID_AUTH_CURRENT_SESSION_KEY, sid);
      await getPodSession(name).handleIncomingRedirect({ restorePreviousSession: true });
    } catch {
      /* per-pod silent refresh can fail if tokens expired */
    }
  }
  pinCurrentSessionToPortal();
  try {
    await portalSession.handleIncomingRedirect({ restorePreviousSession: true });
  } catch {
    /* ignore */
  }
  rememberPortalSessionIdForRedirect(portalSession);
}

import type { IStorage } from '@inrupt/solid-client-authn-core';

/**
 * Default Inrupt browser sessions keep refresh tokens in in-memory "secure" storage, which is
 * wiped on every full-page navigation — including OIDC redirects. That made only the *last* pod
 * stay connected. These backends store insecure + secure fields in localStorage under distinct
 * prefixes so tokens survive redirects and multiple DER sessions can coexist.
 */
export class LocalStorageBackend implements IStorage {
  async get(key: string): Promise<string | undefined> {
    return window.localStorage.getItem(key) ?? undefined;
  }

  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
  }

  async delete(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  }
}

/** Prefix so secure user blobs do not collide with insecure (same logical key, two backends). */
export const SECURE_LOCAL_PREFIX = 'solidAuthSec:';

export class PrefixedLocalStorage implements IStorage {
  constructor(private readonly prefix: string) {}

  async get(key: string): Promise<string | undefined> {
    return window.localStorage.getItem(this.prefix + key) ?? undefined;
  }

  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(this.prefix + key, value);
  }

  async delete(key: string): Promise<void> {
    window.localStorage.removeItem(this.prefix + key);
  }
}

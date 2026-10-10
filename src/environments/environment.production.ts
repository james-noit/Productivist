export const environment = {
  /** Whether accounts and sync exist at all. When false the account UI is hidden and nothing is sent. */
  syncEnabled: true,
  /**
   * Same origin: in production the static host proxies /api/* to the backend (see deploy/nginx.conf.template),
   * so the backend itself is never exposed. The Thunderbird build overrides this (environment.thunderbird.ts).
   */
  apiUrl: '',
};

/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
  /** Main app origin for the demo-request POST (default https://app.perpos.ai). */
  readonly PUBLIC_APP_URL?: string;
  /** Google Tag Manager container id. */
  readonly PUBLIC_GTM_ID?: string;
  /** Google Analytics (GA4) measurement id. */
  readonly PUBLIC_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

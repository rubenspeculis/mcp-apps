export default defineNuxtConfig({
  extends: ["docus"],

  devServer: {
    port: 7001,
  },

  // The site is fully prerendered (SSG) — Content's SQLite is build-time only,
  // so the deployed Cloudflare Worker serves static assets with no runtime DB.
  // NOTE: the Cloudflare nitro preset is applied at build time via `nuxt
  // generate` for deploy (see package.json), NOT here — setting it globally
  // makes Content switch to D1 mode in dev and breaks local content queries.
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ["/"],
      failOnError: false,
    },
  },

  compatibilityDate: "2025-06-01",
});

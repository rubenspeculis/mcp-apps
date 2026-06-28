export default defineAppConfig({
  docus: {
    locale: "en",
  },
  ui: {
    colors: {
      // Matches the indigo→purple brand used by the example components.
      primary: "indigo",
      neutral: "slate",
    },
  },
  seo: {
    siteName: "@mcpapps",
  },
  header: {
    title: "@mcpapps",
  },
  socials: {
    github: "https://github.com/rubenspeculis/mcp-apps",
  },
  github: {
    url: "https://github.com/rubenspeculis/mcp-apps",
    rootDir: "docs",
    branch: "main",
    edit: true,
  },
});

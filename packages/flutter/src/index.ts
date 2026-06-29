/**
 * @mcpapps/flutter — build-time compilation of a Flutter Web app into a `ui://`
 * MCP App component (loader HTML + bundled, cacheable assets).
 */
export { type BuildFlutterComponentOptions, buildFlutterComponent, slug } from "./build.js";
export { type InlineFlutterOptions, inlineFlutterBuild } from "./inline.js";
export { mimeFor } from "./mime.js";
export { resolveFlutterBin } from "./resolve.js";

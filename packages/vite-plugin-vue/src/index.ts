/**
 * @mcpapps/vite-plugin-vue — build-time compilation of Vue SFCs into
 * self-contained `ui://` HTML resources for the server to serve.
 */
export {
  type BuildVueComponentOptions,
  buildVueComponent,
  type ComponentSpec,
  writeComponentsModule,
} from "./build.js";
export { renderComponentHtml } from "./html.js";

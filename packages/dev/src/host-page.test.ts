import { AppNotifications, HostMethods, HostNotifications } from "@mcpapps/protocol";
import { describe, expect, it } from "vitest";
import { renderHostPage } from "./host-page.js";

describe("renderHostPage", () => {
  it("embeds the exact MCP Apps lifecycle method names from the protocol", () => {
    const html = renderHostPage({
      appName: "demo",
      mcpPath: "/mcp",
      renderer: "vue",
      components: {},
    });

    // The host harness must speak the real wire methods or the emulator diverges
    // from a real host. Each is embedded in the page's CONFIG.methods.
    for (const method of [
      HostMethods.Initialize,
      HostMethods.CallTool,
      HostMethods.RequestDisplayMode,
      HostMethods.Message,
      AppNotifications.Initialized,
      AppNotifications.SizeChanged,
      HostNotifications.ToolResult,
      HostNotifications.ToolInput,
      HostNotifications.HostContextChanged,
    ]) {
      expect(html).toContain(method);
    }
  });

  it("escapes the app name in HTML contexts and exposes both load branches", () => {
    const html = renderHostPage({
      appName: "A & B <x>",
      mcpPath: "/mcp",
      renderer: "flutter",
      components: { "ui://demo/x": { basePath: "/_c/x/" } },
    });

    // The app name is HTML-escaped where it lands in markup (title, heading).
    expect(html).toContain("A &amp; B &lt;x&gt;");
    // srcdoc (Vue) and src/basePath (Flutter) branches both present.
    expect(html).toContain("srcdoc");
    expect(html).toContain("basePath");
    // The flutter component's basePath is wired into the page config.
    expect(html).toContain("/_c/x/");
  });
});

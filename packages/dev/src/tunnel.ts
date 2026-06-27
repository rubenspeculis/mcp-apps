import { spawn } from "node:child_process";

export interface Tunnel {
  url: string;
  stop: () => void;
}

export interface TunnelOptions {
  port: number;
  /** Path to the cloudflared binary. Default `cloudflared` on PATH. */
  cloudflaredPath?: string;
}

/**
 * Start an ephemeral Cloudflare quick tunnel exposing a local port over public
 * HTTPS, so a real host (Claude/ChatGPT/VS Code) can reach the dev server.
 * Requires the `cloudflared` binary (`brew install cloudflared`).
 */
export function startCloudflareTunnel(options: TunnelOptions): Promise<Tunnel> {
  const bin = options.cloudflaredPath ?? "cloudflared";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["tunnel", "--url", `http://localhost:${options.port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;

    const scan = (buf: Buffer) => {
      const match = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !settled) {
        settled = true;
        resolve({ url: match[0], stop: () => child.kill() });
      }
    };
    child.stdout.on("data", scan);
    // cloudflared prints the tunnel URL on stderr.
    child.stderr.on("data", scan);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Failed to start cloudflared (${err.message}). Install it with: brew install cloudflared`,
        ),
      );
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      reject(new Error(`cloudflared exited (code ${code}) before announcing a URL`));
    });
  });
}

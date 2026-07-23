import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function repositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("hosted deployment assets", () => {
  it("uses an unprivileged, read-only, loopback-published container profile", () => {
    const dockerfile = repositoryFile("Dockerfile");
    const compose = repositoryFile("compose.yaml");

    expect(dockerfile).toContain("USER 10001:10001");
    expect(dockerfile).toContain('VOLUME ["/data"]');
    expect(compose).toContain("read_only: true");
    expect(compose).toContain('"127.0.0.1:3333:3333"');
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain("- ALL");
  });

  it("documents TLS forwarding and leaves secrets unset", () => {
    const nginx = repositoryFile("deploy/nginx.conf.example");
    const environment = repositoryFile(".env.hosted.example");

    expect(nginx).toContain("listen 443 ssl");
    expect(nginx).toContain("ssl_protocols TLSv1.2 TLSv1.3");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $scheme");
    expect(nginx).toContain("client_max_body_size 256k");
    expect(environment).toContain("GIELINOR_OPERATOR_TOKEN=\n");
    expect(environment).not.toMatch(/GIELINOR_OPERATOR_TOKEN=\S+/);
  });
});

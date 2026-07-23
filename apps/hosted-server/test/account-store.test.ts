import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HostedAccountStore } from "../src/account-store.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("hosted account store", () => {
  it("stores only token hashes and revokes deleting accounts", () => {
    const directory = mkdtempSync(join(tmpdir(), "gielinor-account-store-"));
    temporaryDirectories.push(directory);
    const filename = join(directory, "control.db");
    const store = new HostedAccountStore(filename);
    const created = store.create();

    expect(store.authenticate(created.accessToken)).toMatchObject({ id: created.id });
    expect(readFileSync(filename).includes(Buffer.from(created.accessToken))).toBe(false);
    expect(store.beginDeletion(created.id)).toBe(true);
    expect(store.authenticate(created.accessToken)).toBeNull();
    store.finishDeletion(created.id);
    expect(store.authenticate(created.accessToken)).toBeNull();
    store.close();
  });
});

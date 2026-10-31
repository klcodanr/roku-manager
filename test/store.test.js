import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";

test("persists known Roku devices", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-"));
  const filePath = path.join(directory, "state.json");
  const store = new Store(filePath);
  await store.load();
  await store.setDevice({ id: "serial-1", ip: "http://192.0.2.1:8060/", manuallyAdded: true });

  const reloaded = new Store(filePath);
  await reloaded.load();

  assert.deepEqual(reloaded.getDevices(), [
    { id: "serial-1", ip: "http://192.0.2.1:8060/", manuallyAdded: true },
  ]);
});

test("loads state files created before known devices were added", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "roku-manager-"));
  const filePath = path.join(directory, "state.json");
  await fs.writeFile(filePath, JSON.stringify({ settings: {}, sessions: {} }));
  const store = new Store(filePath);

  await store.load();

  assert.deepEqual(store.getDevices(), []);
});

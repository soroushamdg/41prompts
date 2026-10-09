import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGuardedFetch, guardedLookup, isBlockedAddress, networkReason } from "./guarded-fetch";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "fd00:ec2::254",
    "fe80::1",
    "ff02::1",
    "[::1]",
    "fe80::1%en0",
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e"])("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

describe("guardedLookup", () => {
  it("refuses a name that resolves to loopback", async () => {
    const err = await new Promise((resolve) => guardedLookup("localhost", { all: true }, (e) => resolve(e)));
    expect((err as { code?: string }).code).toBe("BLOCKED_ADDRESS");
  });
});

describe("createGuardedFetch", () => {
  let server: Server;
  let port = 0;
  let hits = 0;
  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits += 1;
      res.end("secret");
    });
    server.on("connection", () => (hits += 1));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const f = createGuardedFetch({ allowHttp: true });

  it.each([
    () => `http://127.0.0.1:${port}/`,
    () => `http://localhost:${port}/`,
    () => `http://0x7f.1:${port}/`,
    () => `http://2130706433:${port}/`,
    () => `http://[::ffff:127.0.0.1]:${port}/`,
    () => `http://017700000001:${port}/`,
  ])("never connects to a local server (%#)", async (url) => {
    await expect(f(url())).rejects.toSatisfy((e) => networkReason(e) === "blocked");
    expect(hits).toBe(0);
  });

  it("refuses plain http, credentials in the URL and the metadata address", async () => {
    const strict = createGuardedFetch();
    await expect(strict("http://example.com/")).rejects.toThrow(/only https/);
    await expect(strict("https://user:pw@example.com/")).rejects.toThrow(/user name/);
    await expect(strict("https://169.254.169.254/latest/meta-data")).rejects.toSatisfy((e) => networkReason(e) === "blocked");
    await expect(strict("https://[fd00:ec2::254]/")).rejects.toSatisfy((e) => networkReason(e) === "blocked");
  });
});

describe("networkReason", () => {
  it("walks causes", () => {
    expect(networkReason(new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "ENOTFOUND" }) }))).toBe("dns");
    expect(networkReason(new Error("plain"))).toBeNull();
  });
});

import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, buildConnector, fetch as undiciFetch } from "undici";

/* Every server-side call to a model provider goes through here (M07). Users
   can type any https URL for a Custom model, so this is the one place that
   stops those calls reaching our own network, the cloud metadata service or
   anything private: https only, no redirects, and every address a name
   resolves to is checked before connecting and again on the open socket, so
   a DNS answer that changes between the two (rebinding) cannot slip through. */

export class BlockedAddressError extends Error {
  code = "BLOCKED_ADDRESS" as const;
  constructor(what: string) {
    super(`Blocked: ${what} is a private or reserved address.`);
  }
}

// Separate lists: Node matches IPv4 addresses against IPv6 rules as mapped
// addresses, so ::ffff:0:0/96 in a shared list would block every IPv4.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const)
  blocked4.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96], // IPv4-mapped
  ["::", 96], // IPv4-compatible (deprecated)
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local, includes fd00:ec2::254
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local
  ["ff00::", 8], // multicast
] as const)
  blocked6.addSubnet(net, prefix, "ipv6");

/** Whether a literal IP address is private, reserved or otherwise off limits. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v = isIP(ip);
  if (v === 4) return blocked4.check(ip, "ipv4");
  if (v === 6) return blocked6.check(ip, "ipv6");
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that refuses a name if any of its addresses is blocked. */
export function guardedLookup(hostname: string, options: { all?: boolean; family?: number | string }, callback: LookupCallback): void {
  dnsLookup(hostname, { all: true, family: Number(options.family) || 0 }, (err, addresses) => {
    if (err) return callback(err, []);
    if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) return callback(new BlockedAddressError(hostname), []);
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

type Options = { allowHttp?: boolean; connectTimeoutMs?: number; headersTimeoutMs?: number; bodyTimeoutMs?: number };

/** A fetch that only reaches public addresses. `allowHttp` exists for tests. */
export function createGuardedFetch(options: Options = {}): typeof fetch {
  const connect = buildConnector({ lookup: guardedLookup as never, timeout: options.connectTimeoutMs ?? 10_000 });
  const agent = new Agent({
    connect: (opts, cb) => {
      if (isIP(opts.hostname.replace(/^\[|\]$/g, "")) && isBlockedAddress(opts.hostname)) return cb(new BlockedAddressError(opts.hostname), null);
      connect(opts, (err, socket) => {
        if (err || !socket) return cb(err ?? new Error("No socket."), null);
        const remote = socket.remoteAddress;
        if (!remote || isBlockedAddress(remote)) {
          socket.destroy();
          return cb(new BlockedAddressError(remote ?? opts.hostname), null);
        }
        cb(null, socket);
      });
    },
    headersTimeout: options.headersTimeoutMs ?? 90_000,
    bodyTimeout: options.bodyTimeoutMs ?? 120_000,
  });

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) throw new BlockedAddressError(`${url.protocol}// (only https:// is allowed)`);
    if (url.username || url.password) throw new BlockedAddressError("a URL with a user name or password");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && isBlockedAddress(host)) throw new BlockedAddressError(host);
    return undiciFetch(url, { ...(init as object), redirect: "error", dispatcher: agent } as never) as unknown as Response;
  }) as typeof fetch;
}

/** The fetch every provider call on the server uses. */
export const guardedFetch = createGuardedFetch();

/** Walks an error's causes for a network failure we can explain. */
export function networkReason(error: unknown): "blocked" | "dns" | "refused" | "timeout" | "tls" | "redirect" | null {
  let e: unknown = error;
  for (let i = 0; i < 6 && e; i++) {
    const code = (e as { code?: string }).code ?? "";
    const msg = String((e as { message?: string }).message ?? "");
    if (code === "BLOCKED_ADDRESS" || e instanceof BlockedAddressError) return "blocked";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
    if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "ENETUNREACH") return "refused";
    if (code.includes("TIMEOUT") || code === "ETIMEDOUT" || (e as { name?: string }).name === "TimeoutError") return "timeout";
    if (code.startsWith("ERR_TLS") || code.includes("CERT") || /certificate/i.test(msg)) return "tls";
    if (/redirect/i.test(msg)) return "redirect";
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

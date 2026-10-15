import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addSubnet("240.0.0.0", 4, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");

export function isPrivateIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blocked.check(address, "ipv4");
  if (version === 6) {
    if (blocked.check(address, "ipv6")) return true;
    const mapped = address.toLowerCase().startsWith("::ffff:")
      ? address.slice("::ffff:".length)
      : "";
    return mapped !== "" && isIP(mapped) === 4 && blocked.check(mapped, "ipv4");
  }
  return true;
}

export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchError";
  }
}

export async function assertFetchableUrl(
  raw: string,
  allowedHosts: ReadonlySet<string>,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("Enter a complete HTTP or HTTPS URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Only HTTP and HTTPS URLs can be fetched.");
  }
  if (url.username || url.password) {
    throw new FetchError("URLs with embedded credentials are blocked.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal"
  ) {
    throw new FetchError("That host is blocked.");
  }
  if (!allowedHosts.has(host)) {
    throw new FetchError(`Host ${host} is not in ALLOWED_HOSTS.`);
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new FetchError("Private network addresses are blocked.");
    }
    return url;
  }

  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new FetchError("The host did not resolve.");
  }
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new FetchError("The host resolves to a private network address.");
  }
  return url;
}

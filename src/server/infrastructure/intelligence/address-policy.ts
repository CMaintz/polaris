import { BlockList, isIP } from "node:net";

// Addresses a server-side fetch must never reach (docs/09, ADR 0020). Ranges from the IANA
// special-purpose registries (RFC 6890 and its updates).

const V4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local: cloud metadata endpoints live here
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

// Translation and tunnelling prefixes (mapped, NAT64, 6to4, Teredo) embed an IPv4 address
// that could be private, so they are refused whole rather than decoded.
const V6_RANGES: [string, number][] = [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

function blockList(ranges: [string, number][], type: "ipv4" | "ipv6"): BlockList {
  const list = new BlockList();
  for (const [network, prefix] of ranges) list.addSubnet(network, prefix, type);
  return list;
}

const V4 = blockList(V4_RANGES, "ipv4");
const V6 = blockList(V6_RANGES, "ipv6");

/** True for anything that is not a public unicast address, including unparseable input. */
export function isForbiddenAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return V4.check(address, "ipv4");
  if (family === 6) return V6.check(address, "ipv6");
  return true;
}

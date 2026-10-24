import { describe, expect, it } from "vitest";
import { isForbiddenAddress } from "./address-policy";

describe("isForbiddenAddress", () => {
  it.each([
    ["0.0.0.0", "unspecified"],
    ["10.1.2.3", "private"],
    ["100.64.0.1", "CGNAT"],
    ["100.127.255.254", "CGNAT upper edge"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "link-local (cloud metadata)"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private upper edge"],
    ["192.168.1.1", "private"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["fc00::1", "unique local"],
    ["fd12:3456::1", "unique local"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:7f00:1", "IPv4-mapped loopback, hex form"],
    ["::ffff:8.8.8.8", "IPv4-mapped, even of a public address"],
    ["64:ff9b::a00:1", "NAT64 of a private address"],
    ["2002:a00:1::1", "6to4 of a private address"],
    ["not-an-ip", "garbage"],
  ])("rejects %s (%s)", (address) => {
    expect(isForbiddenAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "100.63.255.255", "100.128.0.1", "172.32.0.1", "2606:4700::1111"])(
    "allows the public address %s",
    (address) => {
      expect(isForbiddenAddress(address)).toBe(false);
    },
  );
});

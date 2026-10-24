# ADR 0020 - Server-Side Feed Fetching and SSRF Policy

Status: Proposed (assumed by the implementing agent, awaiting owner review)

Users add RSS/Atom URLs and the server fetches them. A URL the user types is an SSRF vector
(docs/09). The docs do not set a policy.

## Decision

- **https only.** Plain http is allowed only when `POLARIS_FEEDS_ALLOW_HTTP=true`. URLs with
  credentials are refused.
- **Every address is vetted.** The host is resolved (all addresses); if any address is not
  public unicast, the URL is refused. Refused: 0/8, 10/8, 100.64/10 (CGNAT), 127/8,
  169.254/16, 172.16/12, 192.168/16, documentation and benchmarking ranges, 224/4, 240/4,
  and in IPv6 `::/96`, IPv4-mapped `::ffff:0:0/96`, NAT64, Teredo, 6to4, `fc00::/7` (ULA),
  `fe80::/10`, `fec0::/10`, `ff00::/8`. Translation prefixes are refused whole rather than
  decoded. Literal IP hosts are checked the same way.
- **No DNS rebinding.** The connection goes to the vetted address (a pinned `lookup` on
  `node:http(s)`), while TLS SNI and the Host header keep the hostname. Global `fetch` was
  rejected because pinning it needs the `undici` package.
- **Redirects** are followed by hand, at most 3, and each target is vetted from scratch.
- **Limits:** 10 s for the whole fetch, 2 MB body, and a feed content type
  (`application/rss+xml`, `application/atom+xml`, `application/rdf+xml`,
  `application/xml`, `text/xml`). Bodies are read as UTF-8.
- **Parser.** A small reader with no dependency. A document with a DOCTYPE is refused, so no
  entity can be defined or expanded (billion laughs, XXE); only the five predefined entities
  and numeric references are decoded. Markup in titles and descriptions is stripped, text is
  capped (300 / 1000 characters), and a feed contributes at most 200 items.
- Items are deduplicated per feed by guid, else link; items with neither are skipped. Items
  are kept 180 days. An account follows at most 50 feeds.

## Consequences

- Feeds served as `text/html` or in non-UTF-8 encodings are refused or mis-decoded.
- Feeds on private networks (an intranet blog) cannot be followed. That is the point.

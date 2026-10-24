import type { PublishingProvider } from "../../application/action/provider-ports";

// LinkedIn's feed composer opens prefilled from this URL. It is not a documented API, which
// is why it is only a convenience next to the copyable text (ADR 0025).
const SHARE_URL = "https://www.linkedin.com/feed/?shareActive=true&text=";

function shareLink(text: string): string {
  return `${SHARE_URL}${encodeURIComponent(text)}`;
}

export class ManualPublishingProvider implements PublishingProvider {
  readonly id = "manual";
  readonly label = "Manual (copy and post yourself)";
  readonly mode = "handoff" as const;

  async connectionStatus() {
    return { state: "connected" as const, displayName: null, expiresAt: null };
  }

  async publish(_accountId: string, text: string) {
    return { externalId: null, url: shareLink(text) };
  }
}

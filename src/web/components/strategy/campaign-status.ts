import type { CampaignStatusDto } from "../../../shared/strategy-types";

export const CAMPAIGN_STATUS: Record<CampaignStatusDto, string> = {
  planned: "Planned",
  active: "Active",
  done: "Done",
  cancelled: "Cancelled",
};

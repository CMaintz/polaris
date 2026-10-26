import { describe, expect, it } from "vitest";
import { SqliteRecordTable } from "../../infrastructure/db/record-table";
import { SqliteScheduleStore } from "../../infrastructure/intelligence/sqlite-schedules";
import { addAccount, intelligenceDb } from "../../testing/intelligence";
import { ValidationError } from "../errors";
import type { Peer } from "./research-ports";
import { ScheduleService } from "./schedule-service";

function setup(refreshable: boolean) {
  const db = intelligenceDb();
  const { accountId } = addAccount(db);
  const schedules = new ScheduleService(
    new SqliteScheduleStore(db),
    new SqliteRecordTable<Peer>(db, "peers", ["name", "profileUrl", "notes"], "name"),
    () => new Date("2026-03-15T12:00:00Z"),
    {
      metric_refresh: async () => {
        if (!refreshable) throw new ValidationError("Connect LinkedIn under Settings first");
      },
    },
  );
  return { schedules, accountId };
}

describe("metric refresh schedules", () => {
  // A schedule that can never run would fail every day without the user noticing.
  it("are refused while the account cannot refresh from LinkedIn", async () => {
    const { schedules, accountId } = setup(false);
    const input = { kind: "metric_refresh", cadence: "daily", params: {} } as const;
    await expect(schedules.create(accountId, input)).rejects.toThrow(/Connect LinkedIn/);
    expect(await schedules.list(accountId)).toEqual([]);
  });

  it("are accepted without a research question once it can", async () => {
    const { schedules, accountId } = setup(true);
    const input = { kind: "metric_refresh", cadence: "daily", params: {} } as const;
    expect(await schedules.create(accountId, input)).toMatchObject({ kind: "metric_refresh" });
  });
});

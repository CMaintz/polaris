import { AccountService } from "../application/account/account-service";
import { PlanningService } from "../application/planning/planning-service";
import type { Measurements } from "../application/planning/ports";
import { SqliteDataLifecycle } from "../infrastructure/db/data-lifecycle";
import { sqlitePlanningStores } from "../infrastructure/db/planning-tables";
import type { Core } from "./core";

export function buildPlanning(core: Core, measurements: Measurements) {
  const { db, content, resolveAccount, clock } = core;
  const stores = sqlitePlanningStores(db);
  return new PlanningService({ stores, content, resolveAccount, measurements, clock });
}

export function buildAccount(core: Core) {
  return new AccountService(new SqliteDataLifecycle(core.db), core.auth, core.audit, core.clock);
}

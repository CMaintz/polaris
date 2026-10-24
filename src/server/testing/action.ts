import { signedInClient, testContainer } from "../test-support";
import { SqliteDraftStore, SqliteProposalStore } from "../infrastructure/db/action-store";
import { SqliteRecordTable } from "../infrastructure/db/record-table";
import { SqliteContentQueries } from "../infrastructure/db/content-queries";
import { AnalyticsEvidenceFacts } from "../application/analytics/evidence-facts";
import { SqlitePublicationStore } from "../infrastructure/publishing/publication-store";
import type { PlanItem } from "../application/planning/ports";
import type { AiProvider, StructuredRequest } from "../application/ai/ports";
import { DraftService } from "../application/action/drafts";
import { JobWorker } from "../application/jobs/job-worker";
import type { JobHandler } from "../application/jobs/ports";

/** A full test container (real planning, analytics, jobs and audit) and one signed-in user. */
export async function actionKit(email = "ada@example.com") {
  const container = testContainer();
  const user = await signedInClient(container, email);
  return { container, ...(await addUser(container, user)) };
}

type Container = ReturnType<typeof testContainer>;

async function addUser(container: Container, user: Awaited<ReturnType<typeof signedInClient>>) {
  const account = await container.content.ensureAccount(user.userId, "2026-03-01T00:00:00Z");
  return { user, accountId: account.id };
}

export async function secondUser(container: Container, email = "eve@example.com") {
  return addUser(container, await signedInClient(container, email));
}

export function stores(container: Container) {
  return {
    drafts: new SqliteDraftStore(container.db),
    proposals: new SqliteProposalStore(container.db),
    publications: new SqlitePublicationStore(container.db),
  };
}

/** The plan_items table through the account-scoped port, wired as composition does. */
export function planItems(container: Container): SqliteRecordTable<PlanItem> {
  return new SqliteRecordTable<PlanItem>(
    container.db,
    "plan_items",
    ["title", "concept", "targetTopic", "plannedDate", "status", "draft", "postId"],
    "planned_date IS NULL, planned_date, created_at",
  );
}

export function auditActions(container: Container): string[] {
  return (
    container.db.prepare("SELECT action FROM audit_log ORDER BY rowid").all() as {
      action: string;
    }[]
  ).map((r) => r.action);
}

export function resolver(container: Container) {
  return async (userId: string) => (await container.content.findAccount(userId))?.id ?? null;
}

export async function loadDemo(
  container: Container,
  user: Awaited<ReturnType<typeof signedInClient>>,
) {
  await user.request("/imports/demo", { method: "POST" });
  await container.worker.drain();
}

/** A model that answers every call with `respond` and remembers the requests it got. */
export function fakeModels(respond: (request: StructuredRequest<unknown>) => unknown) {
  const calls: StructuredRequest<unknown>[] = [];
  const provider: AiProvider = {
    id: "anthropic",
    model: "fake-model",
    generateStructured: async <T>(request: StructuredRequest<T>) => {
      calls.push(request as StructuredRequest<unknown>);
      const data = request.schema.parse(respond(request as StructuredRequest<unknown>));
      return { data, model: "fake-model", usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
  return { calls, models: { activeProvider: async () => provider } };
}

export function interactions(container: Container) {
  return container.db
    .prepare("SELECT prompt_name AS name, prompt_version AS version, status FROM ai_interactions")
    .all() as { name: string; version: string; status: string }[];
}

export const TEST_CLOCK = () => new Date("2026-03-15T12:00:00Z");

export function draftService(container: Container) {
  const { drafts, publications } = stores(container);
  return new DraftService({
    drafts,
    publications,
    planItems: planItems(container),
    resolveAccount: resolver(container),
    audit: container.audit,
    clock: TEST_CLOCK,
  });
}

/** Runs every queued job through `handlers`, as the real worker would. */
export async function drainJobs(container: Container, handlers: Record<string, JobHandler>) {
  await new JobWorker(container.jobs, handlers, TEST_CLOCK, { baseBackoffMs: 0 }).drain();
}

export function factsOf(container: Container) {
  return new AnalyticsEvidenceFacts(
    container.content,
    new SqliteContentQueries(container.db),
    TEST_CLOCK,
  );
}

export function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

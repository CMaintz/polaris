import { z } from "zod";
import { type Clock, nowIso } from "../clock";
import type { AccountDirectory } from "../accounts/ports";
import type { Account, ApplyStats, ContentStore } from "../content/ports";
import { ConflictError, PermanentJobError, ValidationError } from "../errors";
import { parsePayload } from "../jobs/payload";
import type { Job, JobContext, JobRepository } from "../jobs/ports";
import type { AuditLog } from "../auth/ports";
import type { Dataset, ImportBundle } from "../../domain/content";
import { todayUtc } from "../../domain/dates";
import { FIRST_ACCOUNT } from "../../domain/accounts";
import type { ImportFileStore, SocialDataProvider, SourceFile } from "./ports";
import { acceptedFiles, assertFits, providerFor } from "./provider-choice";

export const IMPORT_JOB = "import";
const MAX_FILE_BYTES = 50 * 1024 * 1024;

interface FileReport extends ApplyStats {
  file: string;
  provider: string;
  warnings: string[];
}

export interface ImportResult {
  accountId: string;
  files: FileReport[];
}

// The target account is fixed when the import starts, so switching accounts while it waits
// cannot redirect it. Jobs queued before accounts existed carry none and use the active one.
const target = { accountId: z.string().optional() };
const importPayload = z.union([
  z.object({ demo: z.literal(true), ...target }),
  z.object({ fileIds: z.array(z.string()).min(1), ...target }),
]);
type ImportPayload = z.infer<typeof importPayload>;

export interface ImportDeps {
  providers: SocialDataProvider[];
  demo: (today: string) => ImportBundle;
  files: ImportFileStore;
  content: ContentStore;
  accounts: Pick<AccountDirectory, "get">;
  jobs: JobRepository;
  audit: AuditLog;
  clock: Clock;
}

export class ImportService {
  constructor(private readonly deps: ImportDeps) {}

  /** The import itself runs as a job, so a large upload never holds the request open. */
  async startImport(userId: string, uploads: SourceFile[]): Promise<Job> {
    if (uploads.length === 0) throw new ValidationError("Choose at least one file to import");
    const now = nowIso(this.deps.clock);
    const account = await this.deps.content.ensureAccount(userId, now);
    for (const upload of uploads) this.assertReadable(upload, account);
    const stored = await Promise.all(uploads.map((u) => this.deps.files.save(userId, u, now)));
    await this.deps.audit.record(userId, "import.started", { files: uploads.map((u) => u.name) });
    return this.deps.jobs.enqueue(
      {
        userId,
        type: IMPORT_JOB,
        payload: {
          fileIds: stored.map((f) => f.id),
          accountId: account.id,
          label: uploads.map((u) => u.name).join(", "),
        },
      },
      now,
    );
  }

  async startDemo(userId: string): Promise<Job> {
    const account = await this.deps.content.ensureAccount(userId, nowIso(this.deps.clock));
    if (account.platform !== "linkedin") {
      throw new ValidationError("Demo data is a LinkedIn dataset; switch to a LinkedIn account");
    }
    if (await this.deps.content.hasDataset(account.id, "linkedin")) {
      throw new ConflictError("Demo data can only be loaded into an account without real data");
    }
    return this.deps.jobs.enqueue(
      {
        userId,
        type: IMPORT_JOB,
        payload: { demo: true, accountId: account.id, label: "Demo data" },
      },
      nowIso(this.deps.clock),
    );
  }

  /** The account, or null before the first import, and which datasets it holds. */
  async status(userId: string) {
    const account = await this.deps.content.findAccount(userId);
    const has = async (dataset: Dataset) =>
      account ? this.deps.content.hasDataset(account.id, dataset) : false;
    return {
      account,
      hasLinkedInData: await has("linkedin"),
      hasDemoData: await has("demo"),
      accepts: acceptedFiles(this.deps.providers, account?.platform ?? FIRST_ACCOUNT.platform),
    };
  }

  async deleteDemo(userId: string): Promise<void> {
    const account = await this.deps.content.findAccount(userId);
    if (account) await this.deps.content.deleteDataset(account.id, "demo");
  }

  /** Job handler. Idempotent, so a retried or crash-requeued import is harmless. */
  async run(job: Job, context: JobContext): Promise<ImportResult> {
    const payload = parsePayload(importPayload, job.payload);
    const now = nowIso(this.deps.clock);
    const account = await this.targetAccount(job.userId, payload.accountId, now);
    if ("demo" in payload && (await this.deps.content.hasDataset(account.id, "linkedin"))) {
      // Re-checked here because real data may have been imported while this job waited.
      throw new PermanentJobError("Demo data was not loaded because real data now exists");
    }
    const sources = await this.readSources(job.userId, payload, context);
    if (sources.some(({ bundle }) => bundle.dataset === "linkedin")) {
      // Real data replaces the demo rather than mixing with it (ADR 0015).
      await this.deps.content.deleteDataset(account.id, "demo");
    }
    const files: FileReport[] = [];
    for (const { file, bundle } of sources) {
      const stats = await this.deps.content.applyBundle(account, bundle, job.id, now);
      files.push({ file, provider: bundle.provider, warnings: bundle.warnings, ...stats });
    }
    await this.deps.audit.record(job.userId, "import.completed", { jobId: job.id });
    return { accountId: account.id, files };
  }

  private async targetAccount(userId: string, accountId: string | undefined, now: string) {
    if (!accountId) return this.deps.content.ensureAccount(userId, now);
    const account = await this.deps.accounts.get(userId, accountId);
    if (!account) throw new PermanentJobError("The account this import was for has been deleted");
    return account;
  }

  private async readSources(userId: string, payload: ImportPayload, context: JobContext) {
    const today = todayUtc(this.deps.clock());
    if ("demo" in payload) return [{ file: "Demo data", bundle: this.deps.demo(today) }];
    const stored = await this.deps.files.load(userId, payload.fileIds);
    if (stored.length === 0)
      throw new PermanentJobError("The uploaded files are no longer available");
    const sources: { file: string; bundle: ImportBundle }[] = [];
    for (const [index, file] of stored.entries()) {
      const bundles = await providerFor(this.deps.providers, file).read(file, {
        importedOn: today,
      });
      sources.push(...bundles.map((bundle) => ({ file: file.name, bundle })));
      await context.reportProgress((index + 1) / (stored.length + 1));
    }
    return sources;
  }

  private assertReadable(upload: SourceFile, account: Account): void {
    if (upload.bytes.byteLength > MAX_FILE_BYTES) {
      throw new ValidationError(`${upload.name} is larger than 50 MB`);
    }
    assertFits(this.deps.providers, upload, account);
  }
}

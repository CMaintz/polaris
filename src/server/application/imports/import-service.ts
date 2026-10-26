import { type Clock, nowIso } from "../clock";
import type { ApplyStats, ContentStore } from "../content/ports";
import { ConflictError, PermanentJobError, ValidationError } from "../errors";
import type { Job, JobContext, JobRepository } from "../jobs/ports";
import type { AuditLog } from "../auth/ports";
import type { ImportBundle } from "../../domain/content";
import { todayUtc } from "../../domain/dates";
import type { ImportFileStore, SocialDataProvider, SourceFile } from "./ports";

export const IMPORT_JOB = "import";
const MAX_FILE_BYTES = 50 * 1024 * 1024;

interface FileReport extends ApplyStats {
  file: string;
  provider: string;
  warnings: string[];
}

export interface ImportResult {
  files: FileReport[];
}

interface ImportPayload {
  fileIds?: string[];
  demo?: boolean;
}

export interface ImportDeps {
  providers: SocialDataProvider[];
  demo: (today: string) => ImportBundle;
  files: ImportFileStore;
  content: ContentStore;
  jobs: JobRepository;
  audit: AuditLog;
  clock: Clock;
}

export class ImportService {
  constructor(private readonly deps: ImportDeps) {}

  /** The import itself runs as a job, so a large upload never holds the request open. */
  async startImport(userId: string, uploads: SourceFile[]): Promise<Job> {
    if (uploads.length === 0) throw new ValidationError("Choose at least one file to import");
    for (const upload of uploads) this.assertReadable(upload);
    const now = nowIso(this.deps.clock);
    const stored = await Promise.all(uploads.map((u) => this.deps.files.save(userId, u, now)));
    await this.deps.audit.record(userId, "import.started", { files: uploads.map((u) => u.name) });
    return this.deps.jobs.enqueue(
      {
        userId,
        type: IMPORT_JOB,
        payload: { fileIds: stored.map((f) => f.id), label: uploads.map((u) => u.name).join(", ") },
      },
      now,
    );
  }

  async startDemo(userId: string): Promise<Job> {
    const account = await this.deps.content.ensureAccount(userId, nowIso(this.deps.clock));
    if (await this.deps.content.hasDataset(account.id, "linkedin")) {
      throw new ConflictError("Demo data can only be loaded into an account without real data");
    }
    return this.deps.jobs.enqueue(
      { userId, type: IMPORT_JOB, payload: { demo: true, label: "Demo data" } },
      nowIso(this.deps.clock),
    );
  }

  async deleteDemo(userId: string): Promise<void> {
    const account = await this.deps.content.findAccount(userId);
    if (account) await this.deps.content.deleteDataset(account.id, "demo");
  }

  /** Job handler. Idempotent, so a retried or crash-requeued import is harmless. */
  async run(job: Job, context: JobContext): Promise<ImportResult> {
    const payload = job.payload as ImportPayload;
    const now = nowIso(this.deps.clock);
    const account = await this.deps.content.ensureAccount(job.userId, now);
    if (payload.demo && (await this.deps.content.hasDataset(account.id, "linkedin"))) {
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
    return { files };
  }

  private async readSources(userId: string, payload: ImportPayload, context: JobContext) {
    const today = todayUtc(this.deps.clock());
    if (payload.demo) return [{ file: "Demo data", bundle: this.deps.demo(today) }];
    const stored = await this.deps.files.load(userId, payload.fileIds ?? []);
    if (stored.length === 0)
      throw new PermanentJobError("The uploaded files are no longer available");
    const sources: { file: string; bundle: ImportBundle }[] = [];
    for (const [index, file] of stored.entries()) {
      const bundles = await this.providerFor(file).read(file, { importedOn: today });
      sources.push(...bundles.map((bundle) => ({ file: file.name, bundle })));
      await context.reportProgress((index + 1) / (stored.length + 1));
    }
    return sources;
  }

  private assertReadable(upload: SourceFile): void {
    if (upload.bytes.byteLength > MAX_FILE_BYTES) {
      throw new ValidationError(`${upload.name} is larger than 50 MB`);
    }
    if (!this.deps.providers.some((p) => p.canRead(upload))) {
      throw new ValidationError(
        `${upload.name} is not a supported file. Upload the LinkedIn data archive (.zip or Shares.csv / Profile.csv) or the analytics export (.xlsx).`,
      );
    }
  }

  private providerFor(file: SourceFile): SocialDataProvider {
    const provider = this.deps.providers.find((p) => p.canRead(file));
    if (!provider) throw new PermanentJobError(`No importer understands ${file.name}`);
    return provider;
  }
}

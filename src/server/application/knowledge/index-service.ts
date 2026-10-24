import { createHash } from "node:crypto";
import { type Clock, nowIso } from "../clock";
import { ConflictError, PermanentJobError } from "../errors";
import type { Job, JobContext, JobRepository } from "../jobs/ports";
import type {
  Embedder,
  EmbedderSource,
  InteractionRecorder,
  KeywordIndex,
  StoredVector,
  VectorStore,
} from "./ports";
import { toJobError } from "../ai/recorded-call";
import { recordedEmbedding } from "./embedding-call";

export const KNOWLEDGE_INDEX_JOB = "knowledge-index";
const BATCH = 64;
// Well under the 8192-token input limit of OpenAI's embedding models at ~4 characters a token.
const MAX_EMBED_CHARS = 8000;

export interface IndexDeps {
  index: KeywordIndex;
  vectors: VectorStore;
  embedders: EmbedderSource;
  recorder: InteractionRecorder;
  jobs: JobRepository;
  clock: Clock;
}

interface Input {
  postId: string;
  text: string;
  hash: string;
}

export interface IndexStatus {
  postsWithText: number;
  keywordIndexed: number;
  semantic: { available: boolean; reason: string | null; model: string | null; embedded: number };
  lastJob: Job | null;
}

/** Ownership is re-checked here: a payload naming another user's account must not run. */
export async function ownedAccount(
  owners: Pick<KeywordIndex, "ownerOf">,
  job: Job,
): Promise<string> {
  const accountId = String(job.payload["accountId"] ?? "");
  if ((await owners.ownerOf(accountId)) !== job.userId)
    throw new PermanentJobError("Account not found");
  return accountId;
}

export class KnowledgeIndexer {
  constructor(private readonly deps: IndexDeps) {}

  async start(userId: string, accountId: string | null): Promise<Job> {
    if (!accountId) throw new ConflictError("Import your LinkedIn data before indexing it");
    return this.deps.jobs.enqueue(
      { userId, type: KNOWLEDGE_INDEX_JOB, payload: { accountId, label: "Search index" } },
      nowIso(this.deps.clock),
    );
  }

  /** Idempotent: only posts whose text changed, or that were never embedded, are sent. */
  async run(job: Job, context: JobContext): Promise<unknown> {
    const accountId = await ownedAccount(this.deps.index, job);
    const keywordUpdated = await this.deps.index.sync(accountId, nowIso(this.deps.clock));
    const { embedder, reason } = await this.deps.embedders.forUser(job.userId);
    if (!embedder) return { keywordUpdated, embedded: 0, semantic: reason };
    const inputs = await this.inputs(accountId);
    await this.deps.vectors.prune(accountId, embedder.model, new Set(inputs.map((i) => i.postId)));
    const stale = await this.staleInputs(accountId, embedder.model, inputs);
    for (let start = 0; start < stale.length; start += BATCH) {
      await this.embedBatch(job, accountId, embedder, stale.slice(start, start + BATCH));
      await context.reportProgress(Math.min(1, (start + BATCH) / stale.length));
    }
    return { keywordUpdated, embedded: stale.length, semantic: null };
  }

  async status(userId: string, accountId: string | null): Promise<IndexStatus> {
    const [lastJob = null] = await this.deps.jobs.listForUser(userId, KNOWLEDGE_INDEX_JOB, 1);
    const { embedder, reason } = await this.deps.embedders.forUser(userId);
    const semantic = {
      available: embedder !== null,
      reason,
      model: embedder?.model ?? null,
      embedded: 0,
    };
    if (!accountId) return { postsWithText: 0, keywordIndexed: 0, semantic, lastJob };
    await this.deps.index.sync(accountId, nowIso(this.deps.clock));
    const inputs = await this.inputs(accountId);
    if (embedder) {
      const stale = await this.staleInputs(accountId, embedder.model, inputs);
      semantic.embedded = inputs.length - stale.length;
    }
    const keywordIndexed = await this.deps.index.indexedCount(accountId);
    return { postsWithText: inputs.length, keywordIndexed, semantic, lastJob };
  }

  private async inputs(accountId: string): Promise<Input[]> {
    return (await this.deps.index.documents(accountId)).map(({ postId, text }) => {
      const input = text.slice(0, MAX_EMBED_CHARS);
      return { postId, text: input, hash: createHash("sha256").update(input).digest("hex") };
    });
  }

  private async staleInputs(accountId: string, model: string, inputs: Input[]): Promise<Input[]> {
    const stored = await this.deps.vectors.vectors(accountId, model);
    const hashes = new Map(stored.map((s) => [s.postId, s.textHash]));
    return inputs.filter((i) => hashes.get(i.postId) !== i.hash);
  }

  private async embedBatch(job: Job, accountId: string, embedder: Embedder, batch: Input[]) {
    const context = {
      userId: job.userId,
      jobId: job.id,
      promptName: "post-embedding",
      promptVersion: "v1",
      inputSummary: { purpose: "index", posts: batch.length, includesPostText: true },
    };
    let vectors: Float32Array[];
    try {
      vectors = await recordedEmbedding(
        this.deps,
        embedder,
        context,
        batch.map((i) => i.text),
      );
    } catch (error) {
      throw toJobError(error);
    }
    const entries: StoredVector[] = batch.map((i, n) => ({
      postId: i.postId,
      textHash: i.hash,
      vector: vectors[n] as Float32Array,
    }));
    await this.deps.vectors.save(accountId, embedder.model, entries, nowIso(this.deps.clock));
  }
}

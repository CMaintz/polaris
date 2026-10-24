import type { PostRecord } from "../../domain/posts";
import { emergingThemes, groundThemes, themePerformance } from "../../domain/themes";
import type { ThemeRunDto, ThemesDto } from "../../../shared/knowledge-types";
import { type Clock, nowIso } from "../clock";
import { ConflictError, PermanentJobError } from "../errors";
import type { AiProvider } from "../ai/ports";
import type { Job, JobRepository } from "../jobs/ports";
import { ownedAccount } from "./index-service";
import type {
  AccountOwners,
  InteractionRecorder,
  ProviderSource,
  ThemeRun,
  ThemeStore,
} from "./ports";
import { structuredCall, toJobError } from "../ai/recorded-call";
import { CONTENT_THEMES, postsToClassify, renderThemePrompt } from "./theme-prompt";

export const KNOWLEDGE_THEMES_JOB = "knowledge-themes";

export interface ThemeDeps {
  providers: ProviderSource;
  posts: { posts(accountId: string): Promise<PostRecord[]> };
  themes: ThemeStore;
  owners: AccountOwners;
  recorder: InteractionRecorder;
  jobs: JobRepository;
  clock: Clock;
}

export type ThemesOverview = Omit<ThemesDto, "lastJob"> & { lastJob: Job | null };

export class ThemeService {
  constructor(private readonly deps: ThemeDeps) {}

  async start(userId: string, accountId: string | null): Promise<Job> {
    if (!(await this.deps.providers.activeProvider(userId)))
      throw new ConflictError("Add an OpenAI or Anthropic API key in Settings first");
    if (!accountId || postsToClassify(await this.deps.posts.posts(accountId)).length === 0)
      throw new ConflictError("Import posts with text before finding themes");
    return this.deps.jobs.enqueue(
      {
        userId,
        type: KNOWLEDGE_THEMES_JOB,
        payload: { accountId, label: "Content themes" },
        maxRetries: 2,
      },
      nowIso(this.deps.clock),
    );
  }

  /** Replaces the account's themes wholesale, so a rerun never mixes two classifications. */
  async run(job: Job): Promise<unknown> {
    const accountId = await ownedAccount(this.deps.owners, job);
    const provider = await this.deps.providers.activeProvider(job.userId);
    if (!provider) throw new PermanentJobError("No AI key is configured");
    const all = await this.deps.posts.posts(accountId);
    const selected = postsToClassify(all);
    if (selected.length === 0) throw new PermanentJobError("No posts with text to classify");
    const demo = selected.some((p) => p.dataset === "demo");
    const { themes, interactionId, model } = await this.classify(job, provider, selected, demo);
    const run: ThemeRun = {
      interactionId,
      provider: provider.id,
      model,
      promptVersion: `${CONTENT_THEMES.name}/${CONTENT_THEMES.version}`,
      classifiedPostIds: selected.map((p) => p.id),
      postsAvailable: all.filter((p) => p.text?.trim()).length,
      basedOnDemo: demo,
      createdAt: nowIso(this.deps.clock),
    };
    await this.deps.themes.replace(accountId, run, themes);
    return { themes: themes.length, postsClassified: selected.length, interactionId };
  }

  private async classify(job: Job, provider: AiProvider, posts: PostRecord[], demo: boolean) {
    const { prompt, promptIds } = renderThemePrompt(posts);
    const context = {
      userId: job.userId,
      jobId: job.id,
      inputSummary: { posts: posts.length, includesPostText: true, demo },
    };
    try {
      const call = { template: CONTENT_THEMES, prompt };
      const { value, model, interactionId } = await structuredCall(
        this.deps,
        context,
        provider,
        call,
      );
      return { themes: groundThemes(value.themes, promptIds), model, interactionId };
    } catch (error) {
      throw toJobError(error);
    }
  }

  async overview(userId: string, accountId: string | null): Promise<ThemesOverview> {
    const [lastJob = null] = await this.deps.jobs.listForUser(userId, KNOWLEDGE_THEMES_JOB, 1);
    const latest = accountId ? await this.deps.themes.latest(accountId) : null;
    const none = { run: null, themes: [], windows: null, emerging: [], lastJob };
    if (!accountId || !latest) return none;
    const posts = await this.deps.posts.posts(accountId);
    const live = new Set(posts.map((p) => p.id));
    // Posts deleted since the run (a demo replaced by real data) take their themes with them.
    const classified = new Set(latest.run.classifiedPostIds.filter((id) => live.has(id)));
    if (classified.size === 0) return none;
    const themes = latest.themes.filter((t) => t.postIds.some((id) => live.has(id)));
    const { windows, emerging } = emergingThemes(posts, themes, classified);
    return {
      run: toRunDto(latest.run, classified.size),
      themes: themePerformance(posts, themes),
      windows,
      emerging,
      lastJob,
    };
  }
}

function toRunDto(run: ThemeRun, postsClassified: number): ThemeRunDto {
  return {
    createdAt: run.createdAt,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    postsClassified,
    postsAvailable: run.postsAvailable,
    basedOnDemoData: run.basedOnDemo,
  };
}

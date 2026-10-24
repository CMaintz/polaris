import { Link } from "react-router-dom";
import type { ThemesDto } from "../../shared/knowledge-types";
import { formatDate } from "../lib/format";
import { useResource, useStartJob } from "../lib/hooks";
import { EmergingTable, ThemeTable } from "../components/knowledge";
import { ResourceView } from "../components/resource";
import { Empty, ErrorBox, JobLine, PageHead } from "../components/ui";

export function ThemesPage() {
  const themes = useResource<ThemesDto>("/knowledge/themes");
  const keys = useResource<{ credentials: unknown[] }>("/ai/credentials");
  const run = useStartJob(themes.reload);
  const hasKey = (keys.data?.credentials.length ?? 0) > 0;

  return (
    <div className="stack">
      <PageHead
        title="Themes"
        intro="The subjects you keep coming back to, found by your AI provider. Their performance comes from your measured data."
        actions={
          <button
            className="btn primary"
            disabled={!hasKey || run.running}
            onClick={() => run.start("/knowledge/themes/run", {})}
          >
            Find themes
          </button>
        }
      />
      {keys.data && !hasKey && (
        <div className="banner error">
          <span>
            Finding themes needs an AI key.{" "}
            <Link to="/settings">Add an OpenAI or Anthropic key in Settings</Link>.
          </span>
        </div>
      )}
      <p className="small secondary">
        Finding themes sends the text of up to your 150 most recent posts to your provider, and
        nothing else. Themes are separate from hashtags.
      </p>
      <ErrorBox error={run.error} />
      <JobLine job={run.job ?? themes.data?.lastJob ?? null} />
      <ResourceView resource={themes}>{(data) => <ThemesBody data={data} />}</ResourceView>
    </div>
  );
}

function ThemesBody({ data }: { data: ThemesDto }) {
  if (!data.run) {
    return (
      <Empty title="No themes yet">
        <p>
          Press Find themes to group your posts into recurring subjects. It takes a minute or so.
        </p>
      </Empty>
    );
  }
  const { run } = data;
  return (
    <>
      <p className="small muted">
        <span className="badge ai">AI classification</span> {formatDate(run.createdAt.slice(0, 10))}
        , {run.provider} {run.model}, prompt {run.promptVersion}. Classified {run.postsClassified}{" "}
        of {run.postsAvailable} posts with text.
        {run.basedOnDemoData && <span className="badge">Demo data</span>}
      </p>
      <section className="card stack">
        <h2>Theme performance</h2>
        {data.themes.length === 0 ? (
          <p className="muted">
            The last run found no recurring themes. Try again after importing more posts.
          </p>
        ) : (
          <ThemeTable themes={data.themes} />
        )}
        <p className="small secondary">
          Medians are over the posts in each theme that have metrics. A post can sit in two themes.{" "}
          <Link to="/search">Search</Link> can filter by theme.
        </p>
      </section>
      <section className="card stack">
        <h2>Emerging themes</h2>
        <EmergingTable windows={data.windows} emerging={data.emerging} />
      </section>
    </>
  );
}

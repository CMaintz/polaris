import type { FormEvent, ReactNode } from "react";
import type { StartedJob } from "../../lib/hooks/job";
import { JobStatus } from "../common/feedback";

export function JobFormCard(props: {
  title: string;
  intro: string;
  job: StartedJob;
  submitLabel: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSubmit();
  };
  return (
    <form className="card stack" aria-label={props.title} onSubmit={submit}>
      <h2>{props.title}</h2>
      <p className="small muted">{props.intro}</p>
      {props.children}
      <JobStatus job={props.job} />
      <div>
        <button className="btn primary" disabled={props.job.running}>
          {props.submitLabel}
        </button>
      </div>
    </form>
  );
}

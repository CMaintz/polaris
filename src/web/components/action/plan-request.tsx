import { useState } from "react";
import { useStartJob } from "../../lib/hooks/job";
import { Field } from "../common/fields";
import { JobFormCard } from "./job-form-card";

export function PlanRequest({ onDone }: { onDone: () => void }) {
  const [weeks, setWeeks] = useState("4");
  const job = useStartJob(onDone);
  return (
    <JobFormCard
      title="Ask for a content plan"
      intro="The AI reads your analytics and current plan and proposes posts, and perhaps one experiment, each with the evidence it rests on. Needs an AI key and imported data."
      job={job}
      submitLabel="Propose a plan"
      onSubmit={() => job.start("/action/proposals/plan", { weeks: Number(weeks) })}
    >
      <Field label="Weeks ahead">
        <select value={weeks} onChange={(e) => setWeeks(e.target.value)}>
          {[1, 2, 4, 6, 8].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </Field>
    </JobFormCard>
  );
}

import { type FormEvent, useState } from "react";
import type { AnswerDto } from "../../../shared/ai-types";
import { useStartJob } from "../../lib/hooks/job";
import { CitedEvidence } from "../content/evidence-list";
import { ErrorBox, JobLine } from "../common/feedback";

export function Ask({ disabled }: { disabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnswerDto | null>(null);
  const ask = useStartJob((job) =>
    setAnswer(job.status === "completed" ? (job.result as AnswerDto) : null),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAnswer(null);
    ask.start("/ai/questions", { question });
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Ask about your data</h2>
      <div className="row">
        <input
          style={{ flex: 1 }}
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which topics get the most comments?"
        />
        <button className="btn primary" disabled={disabled || ask.running || !question.trim()}>
          Ask
        </button>
      </div>
      <ErrorBox error={ask.error} />
      <JobLine job={ask.job?.status === "completed" ? null : ask.job} />
      {answer && <AnswerView answer={answer} />}
    </form>
  );
}

function AnswerView({ answer }: { answer: AnswerDto }) {
  return (
    <div>
      <p style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</p>
      {answer.caveats.length > 0 && (
        <ul className="small secondary">
          {answer.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <CitedEvidence evidence={answer.evidence} />
    </div>
  );
}

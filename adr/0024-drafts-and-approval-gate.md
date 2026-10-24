# ADR 0024 - Drafts, Versions and the Approval Gate

Status: Proposed (assumed by the implementing agent on 2026-10-24; awaiting owner review)

docs/14 lists drafting and approval workflows, and docs/06 says an AI response must never
silently change important data. These choices fill what the documents leave open.

## Drafts

1. **Every save is a version.** A draft keeps all its versions. Restoring an old version
   copies it into a new version, so history is never rewritten.
2. **A draft may link to one plan item** in the same account. A link to another account's plan
   item is refused as "not found", the same answer as for an item that does not exist.
3. **AI drafting writes a version directly.** It does not go through a proposal. docs/06
   allows free-form generation for prose drafts, and a new version changes nothing that
   cannot be restored. AI versions are marked `ai` and record the interaction and whether
   demo data was used (ADR 0015 item 8).
4. **The AI prompt** (`draft-write/v1`) uses the account's top three recent posts by
   engagements as voice examples. They use the stored full text, capped at 1,500 characters
   each. The examples, the brief and the current draft are all fenced as untrusted text. The
   model is told to write placeholders rather than invent facts.
5. **Length.** LinkedIn's limit for a member post is 3,000 characters. Polaris counts UTF-16
   code units. That count is never lower than what LinkedIn shows, so a draft that passes
   cannot be rejected for length. A long draft can still be saved, and an AI draft over the
   limit is kept with a note. Only approving and scheduling refuse it.
6. **Approval belongs to one version.** "Approve for publishing" is the user's own act on
   their own text, so it is a field on the draft, not a proposal. Any later save clears it.
   While a post is scheduled or waiting to be confirmed, the draft is frozen: editing it would
   change text the user already approved for posting.

## Proposals

7. **One `proposals` table** with a zod payload schema per kind: `plan_item`, `experiment`
   and `goal`. The payload is checked when the proposal is stored and again when it is
   applied.
8. **Decisions are compare-and-set.** Approve and reject each run one
   `UPDATE ... WHERE status IN ('pending','failed')`. Only the call whose update lands runs the
   applier, so a double click or a retry applies a proposal once. Rejected and applied
   proposals are final. A failed apply can be approved again.
9. **Appliers create records through PlanningService.** That way dates and references get the
   same checks as records the user types in. Applied plan items start as `planned`, and
   experiments as `planned` with no goal.
10. **Agentic planning** (`content-plan/v1`) plans 1 to 8 weeks ahead. The window runs from
    tomorrow to the last day. It returns up to 12 plan items and at most one experiment.
    Citations are grounded like AI recommendations: invented ids are dropped. A proposal is
    also dropped if no real evidence is left, if it is dated outside the window, or if its
    payload is invalid. That keeps an ungrounded suggestion from looking grounded.
11. **Audit.** Every decision is audit-logged: `proposal.approved`, `proposal.applied`,
    `proposal.apply_failed`, `proposal.rejected`. So is `draft.approved`.

## Not done

There is no editing a proposal before approving it (approve it, then edit the record), and no
goal proposals from the planner yet (the applier exists).

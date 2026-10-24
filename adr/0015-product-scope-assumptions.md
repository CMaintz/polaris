# ADR 0015 - Product Scope Assumptions for the First Release

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

These fill gaps that the product documents leave open. Each one is cheap to change.

1. **One LinkedIn account per user.** The data model allows more, but the UI assumes one.
   Superseded by ADR 0026: a user can have several accounts on different platforms.
2. **Topics come from hashtags.** `#AI` and `#ai` are the same topic, so themes only exist for
   posts with hashtags. AI content themes (ADR 0018) cover posts without them, separately.
3. **Times are stored in UTC.** LinkedIn exports carry no timezone. Posting-time analysis groups
   posts using the timezone offset the browser sends.
4. **Performance bands** are quartiles of total engagements across the user's posts that have
   metrics: top 25%, middle, bottom 25%, or "no metrics".
5. **Goals** measure one of:
   - followers: net gain from the start date toward an absolute target;
   - impressions, engagements or posts published: sums over the goal window;
   - average engagement rate.

   "On track" means progress is at least the share of the window that has elapsed. Two
   exceptions:
   - an engagement-rate goal is "achieved" once the rate in the window reaches the target and
     "behind" otherwise, because a rate does not accumulate over time;
   - a follower target at or below the starting count is "achieved" as soon as the count is at
     or above the target.

6. **Experiments** compare the median of a per-post metric for posts published inside the
   experiment window against the equally long window before it, or against a manual baseline.
   With fewer than 3 posts on either side the verdict is "insufficient data", and a change under
   10% is "no clear change". The UI says this is not a statistical test (docs/03 section 7).
7. **Recommendations** come from AI reviews. The user can accept, dismiss or complete them. Rule
   insights carry a suggested action but no separate recommendation record.
8. **Demo data.** Users can load a clearly labelled synthetic dataset to explore the app:
   - it is stored under a separate `demo` provider;
   - every screen shows a "Demo data" banner while it exists;
   - one click deletes it;
   - AI features work on it, but every output is tagged as based on demo data, so it is never
     presented as real.
9. **Raw uploads are kept** with their SHA-256, so a failed import can be retried and imports
   can be audited. Deleting imported data deletes them too.
10. **Export and deletion.** Users can download all their data as JSON, delete imported data,
    remove AI keys and delete their account (the data lifecycle in docs/09).
11. **Planning is not publishing.** Planner items have the statuses idea, drafting, planned,
    published and dropped. Superseded in part by ADR 0025: Polaris posts only an approved,
    scheduled draft, through a provider the user connected.

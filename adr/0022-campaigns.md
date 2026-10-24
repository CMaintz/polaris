# ADR 0022 - Campaigns: Membership, Baseline and Links

Status: Proposed (assumed by the implementing agent, awaiting owner review)

docs/14 and docs/02 name campaign management without defining it. These choices fill the gap.

1. **A campaign** has a name, an objective, start and end dates, a status (planned, active,
   done, cancelled) and notes. It belongs to an account, not a user (brief: data is scoped by
   `accountId`). The status is set by the user and never derived from the dates, because a
   campaign can be cancelled early or run on in spirit.
2. **Links** go to posts, plan items and goals of the same account. Each link kind has its own
   table with a real foreign key, so deleting a post (or the demo dataset), a plan item or a goal
   drops its links instead of leaving dangling ids. Saving links replaces the whole set, and
   every target is checked against the campaign's account first; an id from another account is
   answered with 404, the same as a missing one, so ids of other users cannot be probed.
3. **Posts that count** are the explicitly linked posts, plus the post a linked plan item was
   published as (`plan_items.post_id`). Posts are **not** added by topic match inside the
   window: a hashtag shared with a campaign does not make a post part of it, and silent
   membership would make the comparison impossible to audit. The link picker offers the posts
   published in the campaign window, so linking them is one click each.
4. **Measured window.** The campaign is measured from its start date to the earlier of its end
   date and the latest imported day. Before the start there is nothing to measure and the API
   says so (null), rather than reporting zeros.
5. **Baseline** is the same number of days immediately before the measured window, so a
   running campaign is compared like for like. Its medians are over every other account post
   published in those days (linked posts are excluded even if they fall inside it); its post
   count is the archive's count of every post published in those days.
6. **Metrics compared:**
   - posts published: for the campaign, the number of linked posts (known exactly); for the
     baseline, posts per day from the data archive only (`dailyPostCounts`), with the days it
     covers, because an analytics export lists only top posts and would undercount;
   - median impressions and median per-post engagement rate, via `summarisePosts`, over posts
     that carry metrics (the count with metrics is shown);
   - follower change: the follower count on the window's last day minus the count on the day
     before it. Both edge days must have a count; otherwise it is "not available", rather than
     measured from whichever day happens to be nearest. Days with a count inside the window are
     reported as coverage.
7. No statistical significance is claimed (docs/03 section 7); the UI shows the two windows
   side by side with their coverage.

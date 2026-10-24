# ADR 0023 - Content Pillars and Funnel Analysis

Status: Proposed (assumed by the implementing agent, awaiting owner review)

docs/03 section 6 asks for "recurring themes" and docs/14 for content themes and funnel
analysis, without defining either. These choices fill the gap.

## Content pillars

1. **A pillar** is a recurring theme the user plans: a name, a description, one or more
   hashtag topics (normalised like imported topics: lower case, no `#`, ADR 0015 item 2) and a
   target share of posts from 0 to 100%. Target shares of all pillars together may not exceed
   100%, since they describe one posting mix; the rest is unplanned.
2. **Matching.** A post belongs to a pillar when it carries any of the pillar's topics. A post
   that matches several pillars counts in each, so actual shares can add up to more than 100%.
   Posts that match no pillar are reported as "unassigned".
3. **Counted posts.** Shares are counted only over fully listed posts (data archive or demo,
   `isFullyListed`) on days inside the archive's coverage (`postCountCoverage`). Elsewhere a
   missing post may just be one the import never saw, and analytics exports list only top
   posts, which would over-weight whatever did well. The report shows how many days of the
   chosen window were measurable. With no coverage the share is null, never 0%.
4. **Performance per pillar** is the median impressions and median engagement rate of the
   same counted posts (`summarisePosts`).
5. **Gap.** Gap is actual minus target share. Within 5 percentage points a pillar is "on
   target"; beyond it "under-served" or "over-served". With fewer than 5 counted posts no
   judgement is made ("too few posts").

## Funnel

6. **Stages** per period: impressions, engagements, new followers, all daily flows from the
   analytics export, summed per week or month. Profile views are a stage of the funnel the
   product would want, but no export Polaris imports carries them, so the stage is always
   null with that reason and never 0.
7. **Conversions** use paired days only: engagement rate is engagements over impressions on
   days reporting both; follower conversion is new followers per 1,000 impressions on days
   reporting both, the same rule as the engagement-rate KPI and goals. The rule lives in
   `pairedRate` in domain/funnel.ts until it is merged with the consolidated domain helper.
8. **Partial edges.** As in the account series, a first or last week or month that the data
   covers only partly is blanked (`dropPartialEdges`), and so are its conversions, since both
   divide by impressions. A campaign window is an explicit range and is never blanked; its
   coverage per stage is shown instead.
9. **Defaults.** The weekly view covers the last 182 days and the monthly view the last 365
   days up to the latest imported day; both can be changed with `from`, `to` or `days`.

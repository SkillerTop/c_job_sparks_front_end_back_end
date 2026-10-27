# UX search and production Web Vitals validation

This document separates implemented safeguards from hypotheses that require real users or real production traffic.

## Rules and Admin search usability study

The product now provides a Rules table of contents, collapsed award-category groups, and category search. These changes are implemented, but their effect on task completion time must be measured rather than assumed.

Run the same moderated tasks with at least five Heads or administrators on the previous release and the candidate release:

1. Find the current quarterly Yellow limit.
2. Find the approval path for a Coordinator Yellow award.
3. Find a category by a phrase from its description.
4. In Admin Rules, locate a category and change its future reward amount.
5. Explain whether the change affects historical Ledger records.

For each task record completion, elapsed time, wrong turns, help requests and a 1–7 Single Ease Question score. Do not record employee names or work-email addresses in notes. Accept the change only when there is no regression in completion rate or critical errors; treat faster completion as a result only when the observed sample supports it.

Keyboard-only and 390 px mobile sessions must be included. Verify that collapsed groups remain discoverable and that search results can be reached and read without a pointer.

## Production and staging Core Web Vitals

The frontend records LCP, CLS and INP through `src/services/webVitalsRum.ts` only in production builds. The protected endpoint `/api/v1/telemetry/web-vitals` validates the payload and writes structured, email-free metrics to application logs. Local visual inspection is not evidence that production Web Vitals pass.

Before comparing releases:

1. Deploy the candidate to staging with the production build and representative data.
2. Exercise login, Profile, Recognition, Shop, Rules and Admin on desktop and mobile.
3. Confirm `Client Web Vitals` records appear after the page is backgrounded.
4. Aggregate p75 by `path`, device class and release for at least one representative traffic window.
5. Use the project budgets: LCP at most 2500 ms and CLS at most 0.1. Track INP at most 200 ms as the production target.
6. Compare the same routes and device classes before and after deployment. Keep sample counts with every result.

Lighthouse CI runs each configured route three times on desktop and mobile and blocks LCP/CLS budget regressions. It is a lab safeguard; it does not replace production RUM, especially for INP.

## Screenshot regression

`e2e/visual-regression.spec.ts` covers Employee, Coordinator, GPM, Head, Top Management and Administrator shells on desktop and mobile. Every run compares two settled renders to catch reload loops or late layout shifts and attaches the image to the report. When a platform-specific approved baseline is present, the same test also performs a strict cross-release pixel comparison. Baselines must be generated from the approved CI OS/browser image and reviewed before committing. Update snapshots only for an intentional visual change:

```bash
pnpm exec playwright test e2e/visual-regression.spec.ts --update-snapshots
```

Then run the same suite without `--update-snapshots`. Unexpected desktop or mobile diffs must block the release.

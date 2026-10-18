# S12 browser evidence

Actual headless Chromium 152 screenshots, captured through the installed ChromeDriver. This is rendered browser QA, separate from SSR/JSDOM tests.

The development harness uses the production `Header`, `AppRoutes`, `OpportunitiesHome` and `EmployerMentorDemo`, with authentication omitted and no API provider. It does not verify a signed-in Clerk session, production deployment or live backend services. The sample links run through the real router. The real private `/career/preview` route is covered by the owner-context route test.

`report.json` records exact CSS viewports and document widths for all 49 captures: 16 screens at each of **1440×900**, **1280×720** and **390×844**, plus a dark-theme history capture. All screenshots are retained locally and ignored at the user's explicit request. The report and reproduction script are committed. Screenshots are viewport captures, with relevant sections scrolled into view. Open disclosure contents can be longer than one viewport.

1. Opportunities landing
2. Candidate history
3. Job posting
4. Requirement connections
5. Evidence selection
6. Application preview
7. Submission success
8. Employer profile
9. Shared chronology
10. Failed concurrency observation
11. Native shortlist confirmation
12. Manual shortlist recorded
13. Mentor question
14. Exact mentor context and consent
15. Illustrative response
16. Candidate history after review

The script also checks native Escape cancellation, refresh restoration, absent inactive/private persona DOM, consent gates and lack of real API requests. Manual image inspection covered representative desktop, compact desktop and mobile landing, history, employer, application, failed observation, mentor and dialog captures. This is not an exhaustive accessibility audit.

To reproduce, start `npm run dev --workspace=@trajectoryos/web -- --port 5192`, start `chromedriver --port=9516 --allowed-ips=127.0.0.1`, then run `python scripts/s12-browser-check.py` from the repository root. Chromium and ChromeDriver must already be installed and compatible. The script creates and deletes its own isolated browser session.

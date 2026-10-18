# TrajectoryOs — 120-second judge demo shot list

Capture a real browser session at 1440×900, then cut to the private product after sign-in. Record the landing and the fictional career journey as browser footage. Record the lab and evidence only from saved attempts with verified results. Do not add a “Watch demo” link until a playable video exists.

| Time | Screen and browser action | Suggested voiceover | Caption overlay |
| --- | --- | --- | --- |
| 0–15s | Open `/` in a fresh tab. Hold on the hero and résumé/evidence visual, then scroll to the retry question. | “A résumé lists skills. TrajectoryOs helps show the engineering decisions and observations behind them.” | `Illustrative product visualization` |
| 15–28s | Move through two or three controls in the retry sequence, then scroll to the five-step workflow. | “One lost response can make a credit request repeat. We connect the lesson, design, investigation, test and saved evidence.” | `Synthetic credits · sequence illustration` |
| 28–42s | Open `/learn/retry-safe-writes/1` in the signed-in tab. Show the response-loss explanation. | “The available seeded lesson teaches HTTP retries and the durable database boundary.” | `Seeded lesson · source and version shown in app` |
| 42–62s | Open `/lab`, resume a prepared draft, show saved HLD and LLD diagrams, then the reviewed implementation and written investigation. Refresh once to demonstrate restoration if time allows. | “The learner draws the request path, records the transaction decision and investigates reviewed code.” | `Saved learner draft · reviewed variants` |
| 62–83s | Open a completed attempt in `/evidence`. Show its actual PostgreSQL T1–T7 observations, one failure, explanation source and immutable history. | “The evaluation reports what the selected trusted variant actually did. The record preserves failures and limits.” | `Recorded PostgreSQL evaluation · show actual status and provider/fallback label` |
| 83–102s | Open `/demo/journey`, show the candidate sharing choice, switch to Employer, inspect the requirement links and manual shortlist control. | “In this fictional career simulation, a learner chooses material to share and a reviewer makes the decision.” | `Fictional interactive simulation · no real application or employer` |
| 102–113s | Switch to Mentor in the same demo and show the contextual question and packet. | “A mentor-style example starts from the actual question and selected context; no live mentor message is sent.” | `Fictional mentor example` |
| 113–120s | Return to `/` final CTA and brand. | “From claimed skills to visible engineering work.” | `TrajectoryOs · HackShift 2026` |

## Recording order

1. Before recording, sign in through the existing Clerk flow and check the API and database are available for private screens. Keep a separate public tab at `/`.
2. Prepare one saved draft with HLD/LLD and investigation notes, plus a separate completed evaluated attempt. Confirm the run's genuine T1–T7 outcomes in the UI. If showing a failure, use a run that actually failed; do not narrate a planned result as observed.
3. Confirm evidence feedback says whether it came from Mistral (`llm`) or the rule fallback. Use the displayed source in the voiceover and overlay.
4. Check the local fictional career state. Use the demo reset control if a clean walkthrough is needed. Do not reset production data.
5. Record the private product as a continuous session where practical; record the landing separately to avoid exposing credentials during sign-in. Cut between the captured clips in the timeline above.

## Local capture instructions

From the repository root, run `npm install` if dependencies are missing, then start the API with its documented local environment and `npm run dev --workspace=@trajectoryos/api`. In another terminal run `npm run dev --workspace=@trajectoryos/web`, then open the Vite URL shown in the terminal (normally `http://127.0.0.1:5173`). The public `/` screen works without Clerk or API configuration; private routes need the existing Clerk publishable key, API URL and running backend. Keep `.env` values, tokens and account details out of the frame.

Use browser capture or an OS screen recorder at 1440×900, 30 fps. Hide bookmarks and notifications. Record system audio only if needed, with narration as a separate track. For the mobile proof, capture `/` at 390×844 after checking no horizontal scroll. Capture 1280×720 as a second desktop check. Keep original footage; do not composite fictional results into product screens.

## Verification before export

- [ ] Every public CTA opens its intended private route and uses existing Clerk sign-in when signed out.
- [ ] The landing carries the illustrative label; the career and mentor screens carry fictional labels.
- [ ] The lesson is identified as seeded, and every evaluation shown has a real saved run and visible test status.
- [ ] The evidence explanation source reads `llm` or `rules` as actually returned.
- [ ] No secrets, private account data, fabricated passing run, claimed code authorship or E2B session appear.
- [ ] The final edit lasts exactly 120 seconds; captions remain readable at the target resolution.

# HackShift 2026 — User Problem and Validation Plan

**Research date:** 17 October 2026  
**Team context:** Four people, two primary developers, roughly 24 hours.  
**Research state:** Desk research only. No student, mentor, faculty or employer interviews were provided or conducted for this report.

## Executive summary

The strongest supportable problem is not “AI writes 99% of code” or “employers can no longer evaluate engineers.” The evidence supports a narrower observation: AI coding assistance is widely used among surveyed developers, and developers report checking outputs against local execution, codebase context, tests and security. A recent METR analysis also found that only around half of late-2025 AI-generated solutions graded as passing on SWE-bench Verified would have been accepted in real-world code review. Those results suggest that judgment and verification matter in software work; they do not prove what employers now require or that our product improves hiring.

**Problem hypothesis to test:** Early-career backend learners can read about engineering concepts but may have too few short, structured exercises where they must state a behavior contract, challenge a plausible AI suggestion, test the code and explain what the evidence supports.

The right first product is one learning lab, not a three-sided learning/mentor/employer marketplace.

## A. Evidence about AI-assisted development

### Verified evidence

1. The 2026 Stack Overflow Developer Survey reports that 65.9% of respondents use AI coding assistants or coding agents at work. It reports 73% daily use among respondents who answered its frequency question. The survey is opt-in and self-reported; it is not an industry census. Sources: [AI data](https://survey.stackoverflow.co/2026/ai/data), [methodology](https://survey.stackoverflow.co/2026/methodology).
2. The same survey says respondents commonly use AI for familiar-code generation, debugging/refactoring and writing tests. Among those answering what they do before using AI output, 76.5% report running it locally, 63.9% comparing it with codebase context, and 53.0% checking tests/security; 9.6% report using output as-is. These are reported behaviors, not an observation of actual code review. Source: [Stack Overflow AI data](https://survey.stackoverflow.co/2026/ai/data).
3. METR’s May 2026 report states that only around half of late-2025 AI-generated solutions graded as passing SWE-bench Verified tasks would have been accepted in real-world code review. This is a bounded result for that benchmark, model period and review definition. It is not a universal probability that AI code is wrong. Source: [METR Frontier Risk Report](https://metr.org/blog/2026-05-19-frontier-risk-report/).
4. First-party vendor pages confirm that assessment companies are responding to AI use: Codility offers deliberate wrong-suggestion tasks; HackerRank has AI-assisted repository tasks; CodeSignal offers simulations and agentic assessments; Chai Prep offers an AI codebase interview and debrief. This is evidence of competition and vendor positioning, not proof of employer demand or product effectiveness. See the [competitor audit](01-market-and-competitor-audit.md).

### Hypotheses, not established facts

- Employers may place more weight on how junior engineers define requirements, validate assistant output and explain trade-offs. The survey supports the relevance of verification behavior to current workflows, but it does not measure hiring criteria.
- Students may find a short task with concrete test results more useful than content alone. No student interviews or learning outcomes were collected.
- A mentor may give more specific feedback when a learner shares a selected attempt snapshot. This is untested.
- A college placement team may distribute the experience to a cohort. No college partnership or procurement interest is established.
- An employer may inspect an evidence report if it is concise and job-relevant. No employer has reviewed our proposed report.

### Claims to reject

- “99% of code is AI-written.”
- “AI has made coding fundamentals obsolete.”
- “Employers now require AI-error detection from every engineer.”
- “Our score predicts who will get hired.”
- “Passing our tests proves job readiness or authorship.”

None of those claims is established by the evidence reviewed here.

## B. The specific problem and user

### Initial target user

An early-career student or recent graduate preparing for a backend internship or entry-level software engineering role. The first exercise should target a narrow database/API behavior, such as safe retries for a local transfer request. A student should be able to benefit without an employer account, mentor session or job feed.

### User job

> When I have studied a backend concept, help me check whether I can apply it to a realistic failure case, identify a bad suggestion, and explain the behavior I actually tested.

### Employer-side problem hypothesis

An employer or reviewer may want more context than a résumé line or a pass/fail result. But a one-task challenge can only show evidence about that task under its test conditions. It cannot stand in for a validated hiring procedure or future performance. No employer problem has been verified yet.

### Why content alone is insufficient for this product claim

Content can explain an idea; it does not show that a learner can apply it in a changed situation. The proposed exercise therefore pairs one short concept with one task, a design decision, a code change, test output and an explanation. This is a product rationale, not evidence that the method improves learning. The learning outcome must be measured with a second, altered scenario or another transfer task.

## C. Proposed learning challenge

**Scenario:** A client posts a local transfer request, the server commits it, but the response is lost. The client retries. The learner must define and implement an idempotency contract.

**Prompt contract to publish before the task:** A retry with the same key and same request must not create a second ledger movement and should return the previously recorded result. Reusing the key with a different request must be rejected. State explicitly how a terminal business failure such as insufficient funds is handled. Do not claim exactly-once behavior across external payment providers; this exercise covers one local database-backed operation.

**AI prompt for the exercise:** Show one intentionally weak suggestion, such as keeping used keys in an in-memory map and checking the key separately from the ledger change. Ask the learner to identify what can fail on restart or concurrent requests, write a test and explain a safer approach. The prompt should say the suggestion is a test fixture, not imply that all AI tools produce the same error.

**Evidence shown after the run:** the exact submitted design statement, the selected code or patch, each test name and result, and a short record of what the checks establish and leave unknown. Do not infer authorship from an edit trace. Use [Stripe’s idempotent-request documentation](https://docs.stripe.com/api/idempotent_requests) as a public reference for the API retry concept, not as validation of the HackShift assessment.

## D. Validation experiments

These are proposed next steps, not completed research. A small HackShift-stage sample can reveal usability failures, not population demand, predictive validity or learning effectiveness.

| Hypothesis | Small test | Observe | Falsifying signal |
|---|---|---|---|
| Learners recognize the retry bug and can state a contract | 5–8 target students, individually; give the brief without a walkthrough | Time to identify duplicate movement; whether the learner distinguishes same-key replay from a new request | Most cannot parse the task after one clarification, or the task tests obscure setup rather than the concept |
| The lesson-to-task sequence helps transfer | Ask students to solve a short variant with one constraint changed after the task | Can they explain which design choice changes and why? Compare lesson-first versus task-first order if time permits | Learners memorize the exact fix but fail to adapt to the changed case |
| Evidence card is understandable and bounded | 3–5 reviewers inspect a report without a live explanation | Can they name the passing behavior, the failure/limitation, and a next question within about a minute? | Reviewers read a score as general competence or cannot locate the evidence |
| Attempt snapshot improves mentor context | 2–3 volunteer mentors compare a free-text request with a consented evidence snapshot | Whether they can identify the blocker and choose a useful next check with less clarification | The summary omits important context, increases review effort, or exposes material the learner did not intend to share |
| Cohort distribution is plausible | Ask one faculty/placement contact to react to the single-task workflow and delivery format | Required setup, supervision and curriculum fit | Cohort owner sees no useful place for it or cannot run it without substantial integration |

The numbers above are target sample sizes for exploratory usability work, not market estimates. Do not turn a few positive reactions into claims of retention, placement demand or employer acceptance.

### Minimum measurement set

- Completion and drop-off point.
- Whether the learner states a usable behavior contract before coding.
- Which specified tests were run and passed.
- Whether the learner catches the seeded failure mode.
- Whether the learner can explain one relevant trade-off.
- Reviewer interpretation accuracy and time.
- The learner’s confidence before and after, recorded as self-report and not as skill proof.

Do not combine these into a single hiring score. A second task or repeated independent review is needed before making stronger claims about transfer or scoring consistency.

## E. Immediate users, partners and cold start

**Who benefits without partners:** The learner. One self-contained exercise and feedback report can deliver practice value even when no mentor or employer is present.

**Why a student might return:** A clear next exercise and visible progress on specific behaviors could make practice feel less abstract. This is a retention hypothesis; no repeat-use data exists.

**Why a mentor might participate:** A scoped question with selected test results and a code excerpt may make a short volunteer session more focused. It may also create privacy and review burden. Do not assume free mentor supply.

**Why an employer might eventually care:** The artifact is closer to the task than a course-completion badge. The employer still needs to judge whether the task is role-relevant, repeatable and fair. Candidate consent, accessibility and evidence limits must be clear.

**Cold-start risks:** real projects need employers; mentors need a reason and time; job matching needs current listings and candidate data; hiring evidence needs validation. A college cohort can provide a first distribution channel, but only after a willing instructor or placement contact agrees to pilot it.

## Recommendation

**MODIFY.** Test whether one contract-first, AI-aware backend lab helps a learner apply a concept and lets a reviewer understand what happened. Keep employer hiring use, mentor matching, résumé tailoring and job discovery out of the validated-problem claim.

**Top three risks**

1. Public evidence supports AI use and verification concerns, but not that employers are seeking this product.
2. The nearest competitors already provide AI-aware coding tasks and evidence reports.
3. A single scripted bug may teach a narrow trick rather than transferable engineering judgment.

**Next actions**

1. Lock one scenario and a written behavior contract.
2. Run exploratory student sessions and record unprompted failure points.
3. Test whether a second, changed scenario measures transfer beyond memorizing the fix.
4. Let reviewers interpret the evidence card without a pitch.
5. Only after those tests, ask whether a college cohort or employer pilot is worth pursuing.

## Sources

- [Stack Overflow 2026 AI data](https://survey.stackoverflow.co/2026/ai/data) and [methodology](https://survey.stackoverflow.co/2026/methodology).
- [METR Frontier Risk Report, May 2026](https://metr.org/blog/2026-05-19-frontier-risk-report/).
- [Stripe API Reference: idempotent requests](https://docs.stripe.com/api/idempotent_requests).
- Competitor product claims and URLs: [01-market-and-competitor-audit.md](01-market-and-competitor-audit.md).

Sources accessed 17 October 2026. The survey and vendor pages are cited for the specific evidence stated; interpretations and validation ideas are labeled as hypotheses or proposals.

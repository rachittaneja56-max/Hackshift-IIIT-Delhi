# HackShift 2026 — Judge Questions and Honest Answers

**Prepared:** 17 October 2026  
**Product status:** The supplied materials describe a concept and research, not a verified build. Use these answers only after checking the actual demo state.

## Five toughest objections

### 1. “Why not CodeSignal or HackerRank?”

**Answer:** “Those products already cover important parts of this space. HackerRank has AI-assisted repository tasks and captured interview evidence; CodeSignal has learning, simulations and assessment. Codility even has tasks where the AI suggestion is deliberately wrong. We are not claiming to replace them. Our 24-hour experiment is narrower: does one lesson-to-task loop help an early-career learner apply a backend concept and understand the evidence from their own tests?”

**If pressed:** “We have not verified a competitor gap. If students and reviewers do not find this learning workflow more useful than a course, an ordinary code task or those existing tools, we should not claim differentiation.”

**Evidence:** [HackerRank Summer 2026](https://www.hackerrank.com/release/summer-2026/), [CodeSignal Simulations](https://codesignal.com/simulations/), [Codility AI-Native Tasks](https://www.codility.com/ai-native-tasks/).

### 2. “Why would employers trust this evidence?”

**Answer:** “They should not use this one-task demo as a hiring score. It can show what happened in a specific exercise: the contract the learner wrote, the patch they submitted and the tests that ran. It cannot prove authorship, general competence, job readiness or future performance. Before hiring use, we would need job-specific analysis, repeatable scoring, reliability and fairness/accessibility evidence.”

**Why this answer is credible:** Professional selection guidance emphasizes that assessment procedures need to be job-related and supported by validity evidence. The U.S. EEOC also warns about accessibility and discrimination risks in software-based applicant assessment. Sources: [SIOP Uniform Selection Statement](https://www.siop.org/wp-content/uploads/2025/12/UniformSelectionStatement_121525.pdf), [EEOC/DOJ disability-discrimination guidance](https://www.eeoc.gov/newsroom/us-eeoc-and-us-department-justice-warn-against-disability-discrimination).

### 3. “Why isn’t a course or Google Doc enough?”

**Answer:** “A lesson can explain idempotency or transaction behavior, but finishing the lesson does not show whether the learner can apply it to a retry failure. The proposed lab adds a changed engineering scenario, a design decision, a code/test outcome and an explanation. We still need to test whether that improves transfer; we are not claiming that a single exercise proves mastery.”

### 4. “Couldn’t a student build this with ChatGPT?”

**Answer:** “Yes. ChatGPT can explain the concept, generate a starter implementation and suggest tests. That is why a chat wrapper is not our differentiator. The product hypothesis is a stable, repeatable task contract with deterministic checks and an evidence report tied to the actual run. That is copyable too; we need to show that students or instructors find the workflow useful enough to return to.”

### 5. “What is actually working in your demo?”

**Answer to use after the team verifies the build:** State only the exact end-to-end steps that run on the current commit: “You can [show implemented prompt], [run these exact tests], and [view this report generated from the run]. These parts are seeded/proposed: [name them].”

**Current research status:** No repository, deployed preview or test-run output was included with the materials reviewed here. Therefore this research cannot verify that any proposed product feature is currently working. Do not fill the answer with planned features. Before presenting, do a clean-start run and write down the exact tests, results, generated/seeded content and reset path.

## More likely questions

### “Isn’t deliberately bad AI output a contrived test?”

**Answer:** “It is a controlled learning exercise, not a representative sample of all AI mistakes. We choose a specific retry bug because it makes the contract and test observable. We would need additional tasks and changed scenarios before claiming broader transfer.”

### “What does a passing test prove?”

**Answer:** “Only that the recorded test passed under that task’s conditions. It does not establish authorship, production-scale behavior, security beyond the checks, or general engineering ability. We show the actual test name and keep the limitation next to the result.”

### “Are you scoring people with AI?”

**Answer:** “The first version should not produce an overall hiring or employability score. Deterministic checks report specified behavior. Any generated explanation should cite the recorded result and be labeled interpretive. A human reviews design reasoning.”

### “How do you know there is demand?”

**Answer:** “We do not yet. This pass reviewed public product evidence and current AI-use research; it did not conduct user interviews or measure demand. We plan exploratory sessions with students and reviewers, then a small cohort test. We will report what they do, not claim market size or adoption from a few conversations.”

### “Who is your customer?”

**Answer:** “Initially, the learner. One self-serve task can provide practice value without an employer or mentor. A college cohort is a distribution hypothesis. An employer assessment product is a later possibility only after the task is validated for a specific job use.”

### “How will you make money?”

**Answer:** “We have not validated a business model. The hypotheses are paid advanced practice, college cohort access or sponsored challenge content. We would test who owns the budget and what repeated value they pay for before naming a revenue forecast.”

### “How will mentors participate?”

**Answer:** “The first demo may show a learner-selected evidence snapshot and a proposed request. We will label any sample response as seeded. We do not have verified mentor supply or a live response network.”

### “Will this match résumés to job descriptions?”

**Answer:** “That is roadmap scope, not the centerpiece. Job-description parsing and résumé tailoring already have adjacent products and introduce risks of unsupported claims. We would only draft a candidate-approved claim linked to evidence, and we would not rank candidates based on a one-task score.”

### “What is new here?”

**Answer:** “We are not claiming a new assessment category. We are testing a narrow instructional sequence: concept, stated contract, critique, implementation, tests and bounded evidence. The question is whether that sequence is more useful for learners and reviewers than the separate tools they already use.”

## 30-second closing answer

> “Our first version is one backend practice lab, not a complete hiring marketplace. The learner studies one concept, works through a retry bug with a deliberately flawed AI suggestion, and gets exact test evidence with clear limits. Codility, HackerRank, CodeSignal and Chai Prep already cover adjacent or direct assessment features, so we will not claim a competitor gap. We want to test whether this lesson-to-evidence loop helps students transfer what they learned.”

## Sources

- [Codility AI-Native Tasks](https://www.codility.com/ai-native-tasks/)
- [HackerRank Summer 2026 release](https://www.hackerrank.com/release/summer-2026/)
- [CodeSignal Simulations](https://codesignal.com/simulations/)
- [Chai Prep](https://dsa.chaicode.com/)
- [SIOP Uniform Selection Statement](https://www.siop.org/wp-content/uploads/2025/12/UniformSelectionStatement_121525.pdf)
- [EEOC/DOJ guidance on disability discrimination in software and AI applicant assessment](https://www.eeoc.gov/newsroom/us-eeoc-and-us-department-justice-warn-against-disability-discrimination)

Sources accessed 17 October 2026. Competitor pages verify public product claims; they do not independently establish assessment validity or employer acceptance.

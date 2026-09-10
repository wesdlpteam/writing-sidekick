# TWR 2.0 Section III: assessment and differentiation review

Reviewed 10 September 2026 against the current Writing Sidekick implementation. Source: Judith C. Hochman and Natalie Wexler, *The Writing Revolution 2.0* (2024), Section III, supplied by Nathan. The export contains 46 PDF pages, covering chapters 11–13 and ebook pages 212–241. References below use the exported PDF page numbers.

Status: the research below records the app as it stood before implementation. Nathan subsequently approved the first three recommendations; they are implemented in the working tree alongside a separate Writing Strengths step. See [the implementation plan](../plans/2026-09-10-section-iii-and-strengths.md) and [verification report](../audits/2026-09-10-section-iii-verification.md). This adds original guidance to the app's prompts; it does not retrain the underlying model. The chapter's classroom directions are reference material, not instructions to the coding agent. The source PDF, worksheets and published student samples have not been added to the repository or uploaded to a model provider.

## Overall finding

Section I explains how to teach particular sentence strategies. Section III adds a stronger basis for deciding which strategy to select, how much help to provide, and what a sample can actually tell us. It can improve the app, especially its differentiation and assessment judgments.

The existing app already follows several of its principles: identify demonstrated strengths before choosing targets; read the surrounding passage; give fewer targets when appropriate; separate editing from writing craft; preserve concise persuasive topic sentences; and match model ambition to demonstrated writing control. These should be retained, not presented as new additions from this section.

## Highest-value improvements

| Recommendation | Source | Current app and proposed change |
| --- | --- | --- |
| Differentiate the support within a strategy | pp. 17, 25–26, 30–32, 45 | `api/_curriculum.js` already asks for attainment-sensitive feedback, but `api/_criteria.js` still excludes strategies through fixed `minYear` values. Give a task fewer question prompts, a sentence stem, choices or fewer sentences to combine when support is needed. Give a more independent reasoning task when the writing supports it. Review age restrictions individually against Australian expectations and classroom teaching; do not simply remove every restriction or copy the book's US grade table. |
| Check paragraph focus before adding more | pp. 10, 34–36, 39 | The criteria mention relevance, but the power-up instructions in `api/feedback.js` say every after-model must retain every before-model idea. That conflicts with a useful revision that removes an irrelevant detail. Add an explicit relevance/revision option, permitting a justified deletion for that strategy while retaining the information-preservation rules for sentence combining and kernel expansion. |
| Represent insufficient evidence honestly | pp. 7–12, 15 | `criteriaPrompt()` currently assigns `steady` when a short sample gives too little evidence; the UI displays this as “On track”. That is stronger than the evidence supports. Distinguish “not enough evidence in this sample” from a demonstrated strength or a skill needing work. Do not require a remedial task for every unassessable area. This needs coordinated schema, display, summary and export changes. |
| Assess the effect of a revision | pp. 9, 14–15, 29–30 | `getLevelUp()` and a before/after server route exist, but the current `js/app.js` does not call that client function. A future revision flow could compare the two checked drafts against the selected power-up, recognise a successful change and reduce support on a later attempt. Existing comparison logic checks for new quoted words, so it would also need to recognise successful deletion and reordering. Keep the comparison within the session to preserve the current no-storage design. |

The first three are the strongest candidates for the next feedback improvement. The fourth is a separate student workflow and should be designed as such.

## What stronger differentiation would look like

The chapter's concrete examples vary the amount of support without abandoning the shared strategy or subject. More demanding content and reasoning can make a sentence task challenging even for a proficient writer. More words or a more impressive strategy name are not sufficient evidence of improvement.

For an elaboration task, an original example of differentiated instructions would be:

- More support: “Add one example. Start with ‘For example’.”
- Greater independence: “Explain how your example supports your reason.”
- Further stretch, only when the writing is ready: “Explain when your reason applies, and qualify any overstatement.”

These are alternative tasks selected from the sample, not three compulsory tasks given together. Year level still sets the curriculum reference and the language of the instructions. The quality and independence demonstrated in this draft guide the challenge and help offered. One sample cannot establish a permanent ability level.

Nathan's topic-sentence requirement remains: state the persuasive paragraph's main reason concisely, then develop evidence and explanation in the following sentences. Section III's distinction between a topic sentence and its supporting details reinforces that separation; it does not justify making every opening sentence longer.

## Useful extensions that need additional context

**Teacher support and task context.** Pages 8–11 distinguish independent writing from writing produced with a supplied starter or other help. The current feedback request contains the transcript, year and genre, without that information. An optional teacher setting could record the task, strategies taught and supplied assistance. Until then, recognise a skill visible in the text without claiming the child demonstrated it independently. Do not infer a content-knowledge deficit from undeveloped writing when the source material and teaching are unknown.

**Content-based practice.** Pages 17–27 explain how familiar curricular content can support sentence work. Apply the student's task to their own subject and known information. Preserve Nathan's existing requirement for a different-topic worked model, using a familiar analogy with enough context to understand it. Do not invent subject evidence for the student or import the textbook's examples as facts about their assignment.

**Revisit strategies as needed.** Pages 28–32 and 45–46 recommend returning to earlier strategies alongside newer ones. An older writer can still benefit from sentence work; a fluent younger writer should not receive a deliberately simplistic model. The chapter does not require every app session to start with a remedial sentence drill or require mastery of every sentence strategy before paragraph work.

**Separate composition from mechanics.** Pages 10–12 warn that spelling and handwriting can distract from progress in organisation and sentences. Preserve the separate editing audit. Error totals alone must not lower judgments of idea development or determine model ambition. This section does not provide an OCR method or a replacement algorithm for spelling counts.

**Progress over time.** Pages 12–15 recommend multiple samples and portfolios. Useful for teachers, but a stored student portfolio would change this app's stated privacy model. Do not add persistent profiles as a side effect of integrating the chapter. The book's comparative-judgment discussion also does not validate a precise AI attainment score from one sample.

## Verification cases for a future implementation

Use invented samples and review the teaching quality, not just whether the response has the correct fields:

1. The same year level with foundational and fluent writing: different support and an attainable model for each.
2. The same writing at different year levels: age-appropriate instructions without ignoring demonstrated control.
3. A coherent short extract: no invented whole-essay weakness or unjustified “On track” judgment.
4. A strong paragraph containing one irrelevant sentence: revise its focus rather than add more detail.
5. A concise persuasive topic sentence with evidence already following: preserve it and identify a different real gap.
6. Strong ideas with spelling errors: recognise the ideas while auditing mechanics separately.
7. A supplied topic-sentence starter: do not claim independent topic-sentence construction.
8. A revision that improves the piece by deleting or reordering: recognise the improvement without requiring added words.

Review implemented interface changes in a real browser at desktop and mobile sizes. The linked verification report records the subsequent live-output and browser checks. Teacher-provided assistance and revision-upload workflows remain future work, so cases requiring those inputs are not claimed as implemented.

## Source limits

Appendix F's Writing Assessment Checklists are referenced on PDF page 11 but are not included in this export. Their actual contents have not been reviewed. The grade tables describe a teaching sequence with oral, whole-class and independent stages; they are not Australian year-level assessment cut-offs. The supplied PDF's wide tables visibly clip some right-edge content, so this review does not rely on the clipped entries.

The review used extracted text from all 46 pages and visual inspection of image-based exhibits and representative tables. Recommendations are our application of the chapter to this app; the source does not prescribe these software features.

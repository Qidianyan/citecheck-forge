# CiteCheck review pack — reviewer guide

**Purpose.** The eval labels are *silver* (rules + LLM judge). This pack samples ~100 citations
stratified by country (VN/ID/TH), gold verdict, question language (zh vs local), and ~30 cases where
the CiteCheck verifier disagreed with the gold label. You re-label them so we can measure how good the
silver labels and the verifier really are. The corpus of laws is bundled in `src/corpus/`; the pack's
`official_source_url` column points at the official gazette page for the cited law.

**How to judge one row.**
1. Open `official_source_url` (or the law named in `law_as_written`) and read the cited
   `article`/`clause`. Compare it with `claim`, `quoted_text` and `answer_excerpt`.
   `official_excerpt` is the cached official text of the cited article (trust the official page if they differ);
for registry-only laws it is the repeal-evidence article from the corpus.
2. Pick `reviewer_verdict` from the SCHEMA.md enum: `EXISTS_CONSISTENT`, `EXISTS_UNQUOTED`,
   `CONTENT_MISMATCH`, `ARTICLE_NOT_FOUND`, `NOT_IN_FORCE`, `UNVERIFIABLE`.
3. Pick `reviewer_types`: any of H1–H7 (see SCHEMA.md), multiple allowed, e.g. `H3;H7`. Leave empty
   when the verdict is not a hallucination.
4. Fill `reviewer_confidence` (1 = guess, 2 = likely, 3 = certain after reading the official text),
   `reviewer_notes` (what you checked, in one sentence) and `reviewer_initials`.

**Rules (from SCHEMA.md).** Only official text counts — never "correct" a citation from memory.
`UNVERIFIABLE` is a verdict, not a hallucination type: when no official text is reachable, say so and
stop. Never guess; if the answer paraphrases instead of quoting, use `EXISTS_UNQUOTED`, not a mismatch.

**Process.** Two reviewers label every row independently; a third adjudicates disagreements and the
adjudicated verdict goes in the row. Time estimate: 3–10 minutes per row, ~10–16 hours for the pack.

**Return.** Save the file as the same name `eval/review/review_pack.csv` (UTF-8, keep the header and
all columns) and hand it back; `node eval/review/apply-reviews.mjs` turns it into
`reviewed_labels.jsonl` plus agreement stats.

**Do NOT.** Edit any column except the six `reviewer_*` ones; add personal data (names, emails,
IDs); invent article text, URLs or dates; or delete rows you find hard — mark them `UNVERIFIABLE`
instead.

# Fresh held-out set — construction method

**Purpose.** A label-correct-by-construction held-out set for CiteCheck, replacing the
looked-at 30% split. It uses only articles that never appear in `eval/data/dataset.jsonl`
(any split) and is scored exactly once by the reviewer after the verifier config is frozen.

**Untouched-article rule.** `used` = every `(gold.law_id, leading integer of article)` pair
in `dataset.jsonl`. Candidate articles come from corpus laws that have `articles`, are not
`stub`, and are not `TH-PDPA-2562-EN` (English helper text); the article must not be in
`used` and its cached text must be 250–1500 chars. Candidates are ordered deterministically
by `sha256(seed|law_id|article)`. At most 6 items per `(law, type)` so all laws are
represented. `as_of` is `2026-11-10` for every item.

**Item types and labels (by construction).** `text` is a 1–3 line local-language AI-style
answer naming the law with a deterministic alias and the article in local format
(VN `Điều N`, ID `Pasal N` sometimes `Pasal N ayat (1)`, TH `มาตรา N` — half of TH items in
Thai digits, zh `第N条`). A = cited article, B = a different untouched article of the same
law sharing < 30% word tokens with A.

| type | construction | expected verdict | flagged | types |
|---|---|---|---|---|
| C_QUOTE | verbatim 60–240 char span of A (word-aligned, line breaks collapsed) in quotes, cited as A | EXISTS_CONSISTENT | false | [] |
| C_CLAIM | first sentence of A, unquoted, cited as A | EXISTS_UNQUOTED | false | [] |
| H3_CLAIM | first sentence of B, unquoted, cited as A | CONTENT_MISMATCH | true | H3 |
| H4_QUOTE | verbatim span of B in quotes, cited as A | CONTENT_MISMATCH | true | H4 |
| H1_ARTICLE | number `max_article + k` (k 3–40, deterministic) | ARTICLE_NOT_FOUND | true | H1 |
| H7_NUMBER | quoted span of A with its number changed (×2 or +7) | CONTENT_MISMATCH | true | H4,H7 |
| H5_REPEALED | article of a law not in force on `as_of`, own number | NOT_IN_FORCE | true | H5 |
| ZH_SAME | zh paraphrase cited as its own article | EXISTS_UNQUOTED | false | [] |
| ZH_H3 | zh paraphrase cited as another untouched article of same law | CONTENT_MISMATCH | true | H3 |

`source.cited_article_text_from` = `law_id#article` of the cached article the answer's content was
lifted from (A for C_*/H7/H5/ZH_SAME, B for H3/H4, the paraphrase's own article for ZH_H3,
`null` for H1).

**Label semantics.** `flagged` = verdict ∈ {ARTICLE_NOT_FOUND, CONTENT_MISMATCH,
NOT_IN_FORCE}; negatives carry an empty `types` array.

**Known biases.** Verbatim-lifted claims are easier than real LLM paraphrases; the Chinese
paraphrases were authored by an LLM (translation drift is not represented); there is no
real LLM answer noise (no hedging, retrieval trails, or multi-citation documents); H5 items
are VN-only because the only repealed laws with full cached text are Vietnamese; single
citation per answer only.

**Governance.** Scored once after freeze; never tune on it. The generator never runs
`verify` and never computes precision/recall. Labels are by construction: a frozen verifier
config may still disagree with a label (e.g. a single-digit edit inside a long verbatim quote
can stay above the literal-match threshold when numeric checks are advisory), and such
config-level misses are out of scope for this set's labels.

**Provenance (phase 4).**
- The generator and scorer were written by pi task F and reviewed and fixed by the reviewer. The fixes: join the PDF hard line breaks, drop Vietnamese article titles, and cut spans and claims at word boundaries.
- The Chinese paraphrases (`zh_paraphrases.json`) were written by pi task Z (an LLM) from `zh_input.json`. Inputs are 60 untouched articles, 20 per country, chosen by sha256 order.
- The verifier config was frozen in commit 4485595. The fresh set was generated and committed after that, and then scored once.
- Disclosure: while building the scorer, pi ran its smoke test once on an older, pre-freeze set and code. Nobody used or tuned on that output, and the reviewer never saw it.

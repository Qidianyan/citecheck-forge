# Demo v2 seed data — how to seed the dev site later

Company: **Mekong Retail Pte. Ltd.** (fictional). All names, policy texts and issue contents
in this folder are invented demo data; no real personal data is used.

## Files in this folder

| File | Purpose |
| --- | --- |
| `demo_memo_v2_en.txt` | AI-drafted compliance memo (Vietnam / Indonesia / Thailand). Every CiteCheck verdict and hallucination type H1–H7 appears on its own line. |
| `expected_v2.json` | The expected verdict per memo line, generated from the real verifier (`verify` + `enrich`) and checked by hand. |
| `POL-7_data_retention_policy.txt` | Fictional internal policy page, clauses §1–§5, in the plain-text shape `parseClauses` parses. |
| `LEGAL-12_jira_issue.md` | Fictional Jira work item with three AI-drafted citations (one flagged) and the label `legal-review`. |

## Seed order for the (future) Forge dev site

1. Create the space **"Legal"** in the dev site.
2. Create page **"Demo memo v2 (English)"** and paste the full content of
   `demo/demo_memo_v2_en.txt` into the body.
3. Create page **"POL-7 Data Retention Policy"** and paste the full content of
   `demo/POL-7_data_retention_policy.txt` into the body. Note the page id shown by the
   site — you need it in the next step.
4. Open the CiteCheck admin page, go to **Organisation sources**, and register the POL-7
   page with source key `POL-7` and the page id from step 3. This makes
   `Policy POL-7 §3` verifiable and leaves `Policy POL-7 §9` as a missing clause.
5. Create Jira project **LEGAL** (fictional), create issue **LEGAL-12**, add the label
   `legal-review`, and paste the content of `demo/LEGAL-12_jira_issue.md` into the
   description.
6. Run the demo clicks in this order:
   1. Open the "Demo memo v2 (English)" page and run CiteCheck on the whole body —
      the report shows every verdict/row from `expected_v2.json` plus the two
      POL-7 organisation-source rows (§3 verified, §9 missing).
   2. Open the "POL-7 Data Retention Policy" page and re-register it after any edit to
      watch clause text refresh.
   3. Open Jira issue LEGAL-12 and run CiteCheck on the description — one citation is
      flagged (Section 99 does not exist; the Act has 96 sections).

## Expected demo outcome

- ✅ EXISTS_CONSISTENT — exact quotes (Article 9 VN PDPA Law; Section 19 Thai PDPA English translation; POL-7 §3).
- 🟡 EXISTS_UNQUOTED — faithful paraphrases (Articles 20/23 VN; Pasal 20 ID; Pasal 5 Jira line).
- ❌ ARTICLE_NOT_FOUND (H1) — Article 99 of Law No. 91/2025/QH15 (only 39 articles); POL-7 §9; Section 99 of the Thai PDPA.
- ⚠️ NOT_IN_FORCE (H5) — Article 11 of Decree 13/2023/ND-CP, repealed 2026-01-01.
- ❌ CONTENT_MISMATCH + H4 — Section 26 Thai PDPA quote that is not in the article.
- ❌ CONTENT_MISMATCH + H3 — Indonesian paraphrase of the consent-withdrawal right (Pasal 9) cited to Pasal 5; `suggested_article` = 9.
- ℹ️ H7 numeric advisory — Article 23 VN breach notification claimed as "24 hours" vs the official 72 hours.
- ❔ UNVERIFIABLE — Singapore's PDPA (not in the bundled corpus) and a Thai Supreme Court judgment number.

## Coverage note
The verifier emits H1, H3, H4, H5 and H7 (H7 as an advisory note by default). A citation to a law or case outside the bundled corpus (H2 candidates such as the Singapore PDPA or the Thai Supreme Court judgment above) is shown as ❔ Unverifiable rather than accused of being invented. H6 (translation drift) is not flagged automatically.

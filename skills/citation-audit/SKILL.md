---
name: citation-audit
description: Run a full legal and corporate-policy citation audit of a Confluence page or Jira work item - verify every citation against official statute texts and registered Confluence policies, explain each flagged hallucination with its authoritative source, and (after user confirmation) post the report and review label back to the page or work item.
allowed-tools: verify-content verify-citation list-registered-org-policies post-confluence-report post-jira-report
---

# Legal citation audit

Use this skill when the user asks to audit, review, check or "clear" a document, contract memo, policy page or AI-drafted answer for legal citations.

## Steps
1. Call `verify-content`. Use the page or work item in context unless the user named another (`contentId` / `issueKey`) or pasted text (`text`). If the user mentions a date ("as of 1 July 2026"), pass it as `asOf` (YYYY-MM-DD).
2. If the document references internal company policies (or `summary.total` is 0 and the user asks which policies are covered), call `list-registered-org-policies` to show registered Confluence policies and whether any are active or archived. If `summary.total` is 0, say no citations were found and show which patterns are recognised (Article/Rule/Điều/Pasal/Section/มาตรา/第…条 with a law name, number or registered policy key). Stop.
3. Report the summary, then list FLAGGED and NOT IN FORCE citations first, then UNVERIFIABLE, then VERIFIED and EXISTS (plain labels, no emoji). For each flagged citation give: the citation as written, verdict, hallucination type, one-sentence reason, official source link, and a shortened official excerpt when present.
4. For a citation the user disputes, call `verify-citation` with the exact citation and quote and show the detailed checks (law in corpus, article exists, in force, quote similarity).
5. Ask: "Post this report as a comment and label the page/work item?" Only on an explicit yes, call `post-confluence-report` (Confluence) or `post-jira-report` (Jira). Report back the comment link and label.

## Interpreting results
- `ARTICLE_NOT_FOUND` (H1): the law is real but the article number is beyond the official text — a classic AI hallucination.
- `NOT_IN_FORCE` (H5): the law/article was repealed or not yet effective on `asOf`; the reason names the repealing act.
- `CONTENT_MISMATCH` (H4/H3/H7): the quoted words are not in that article (similarity < 0.5).
- `EXISTS_UNQUOTED`: the article exists and is in force but the text paraphrases it; you may add an advisory semantic note comparing the paraphrase with `original_excerpt`.
- `UNVERIFIABLE`: never treat as a hallucination; explain the reason and suggest checking the official source manually.

# CiteCheck — Deterministic Legal & Policy Citation Guardrails for Confluence, Jira, Rovo & MCP

CiteCheck is an Atlassian Forge app (`nodejs22.x`) with a **Rovo Agent**, **Rovo Skill**, and **Atlassian MCP server (`rovo:mcp`)** that deterministically verifies legal and corporate-policy citations in Confluence pages, Jira work items, and AI-drafted answers against **33 bundled official statutes** (**EU GDPR**, **EU AI Act**, **US Federal Rules of Civil Procedure incl. Rule 11**, plus **Vietnam, Indonesia, and Thailand** official gazettes) and **registered Confluence company policies**.

Built for **Atlassian Codegeist 2026** (*"Build with context. Ship with confidence."*) — Category: **Apps for Business Teams**; Bonus: **Best Agents** & **Best App with Atlassian MCP**.

## Core Capabilities

- **Global + ASEAN Official Statute Pack (`src/corpus/`, 33 laws, 3.65 MB, zero external API calls):**
  - **European Union:** *Regulation (EU) 2016/679 (GDPR)* Articles 1–99; *Regulation (EU) 2024/1689 (EU AI Act)* Articles 1–113.
  - **United States:** *Federal Rules of Civil Procedure (FRCP)* Rules 1–86, including full verbatim **Rule 11** (signing pleadings, representations to the court, and sanctions) and historical abrogation dates (e.g., Rule 84).
  - **ASEAN:** 30 official government gazette statutes across Vietnam (`16`), Indonesia (`8`), and Thailand (`6`), maintaining **1228 / 1228 (100.00%)** golden parity with our reference verifier.
- **Enterprise Confluence Policy Graph (`src/orgsources/` + `src/rovo/`):**
  - Register internal Confluence pages (procurement thresholds, data retention policies, standard contract playbooks) as authoritative sources stored in Forge Custom Entity Store (auto-chunked over 240 KiB).
  - Full deterministic checks on company policies: **H1** non-existent clause, **H3** IDF-weighted misattributed clause redirect (*"You cited clause 3 of PROC-2026, did you mean clause 7?"* in English and Chinese), **H4** misquoted wording, and **H5** automatic blocking of `archived` or `superseded` Confluence policy pages.
  - **`list-registered-org-policies` Rovo & MCP Action:** lets users and external MCP clients (Claude Desktop, Cursor, Rovo Studio) list and keyword-search active and archived company policies directly in chat.
- **Two-Layer Deterministic Verification Architecture:**
  - **Layer 1 — Deterministic Hard Guardrails (Zero Egress, No LLM Keys, `< 0.3 s` per page):**
    - **100.0% recall** on non-existent articles (**H1**);
    - **97.6% recall** on repealed / not-in-force statutes (**H5**);
    - **100.0% precision (0 false positives across 103 valid citations; 72.2% recall)** on the 301-item fresh untouched-article benchmark;
    - **94.1% clean held-out precision** (`100.0%` in pure rule mode) on 809 real citations from 4 LLMs (where **75.8%** of checkable LLM citations had an error).
  - **Layer 2 — Source-Grounded Paraphrase Review (`EXISTS_UNQUOTED`):** unquoted cross-language paraphrases are never guessed on; CiteCheck attaches the official `original_excerpt` for labelled Rovo semantic notes and one-click human review.
- **Native Atlassian Surfaces & Compliance Workflows:**
  - `confluence:contentBylineItem` & `jira:issuePanel` (UI Kit `@forge/react` 12.5.0, covering 8 lifecycle states including stale-after-edit detection).
  - Permission-aware 4-way Share dialog with explicit confirmation: footer/issue comment + `citecheck-flagged`/`citecheck-verified` label, child sign-off page, `@mention` teammate forwarding + Jira assignment, and Markdown export.
  - Background event triggers (`avi:confluence:updated:page`, `avi:jira:updated:issue` → async queue consumer) and formula-injection-safe CSV audit export.
  - Companion browser playground (`web/`, warm official gazette palette `#F5F0E6` / `#1F1D1A`, zero mock routes in `web/dist/`).

## Run Offline Verification & Tests (No Cloud Credentials Needed)

```bash
npm install                       # installs local dev validator (@forge/manifest) & dependencies
node tools/validate-manifest.cjs  # offline Forge manifest validation -> MANIFEST VALID
node web/build.mjs                # builds pure live-engine static companion into web/dist/
node --test "test/*.test.js"      # runs all 317 unit, integration, UI palette & golden parity tests
npm run eval                      # runs offline evaluation on eval/data/dataset.jsonl (< 5 s)
```

## Deploy to Atlassian Cloud

```bash
forge login                       # Atlassian developer email + API token
forge register                    # assigns live app.id in manifest.yml
forge deploy -e production
forge install --site <your-site>.atlassian.net --product confluence
forge install --site <your-site>.atlassian.net --product jira
```

## Reuse Disclosure

Created for Atlassian Codegeist 2026 (after 2026-10-27): the entire Forge app, `manifest.yml`, Rovo agent/skill/MCP server, `list-registered-org-policies`, UI Kit panels, share workflows, enterprise Confluence policy H1/H3/H4/H5 engine, IDF cross-reference & numeric checks, global EU/US statutory corpus integration, audit store/CSV, and browser playground. Reused and ported from our unpublished October 2026 ASEAN prototype: the Python rule-verifier design (ported to JS in `src/core/`), the 30 cached ASEAN gazette texts, the H1–H7 taxonomy, and the 809-citation ASEAN benchmark (`eval/data/dataset.jsonl`).

## Data Sources & License

- **European Union:** Publications Office of the European Union (EUR-Lex / CELLAR open data) — *Regulation (EU) 2016/679 (GDPR)* and *Regulation (EU) 2024/1689 (Artificial Intelligence Act)*.
- **United States:** *Federal Rules of Civil Procedure* (promulgated by the U.S. Supreme Court pursuant to 28 U.S.C. § 2072; verified via U.S. Courts / Cornell LII).
- **Vietnam / Indonesia / Thailand:** Official gazette publications (`congbao.chinhphu.vn`, `peraturan.bpk.go.id`, Royal Thai Government Gazette; the Thai PDPA B.E. 2562 English text hosted on `dol.go.th` is explicitly labelled an unofficial reference translation).

Code licensed under Apache-2.0 (`LICENSE` and `NOTICE`). CiteCheck verifies statutory and policy citations deterministically and does not provide legal advice.

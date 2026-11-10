# CiteCheck — legal citation verifier for Confluence & Jira (Forge + Rovo)

CiteCheck is a Forge app with a **Rovo Agent** that checks every legal citation in a Confluence page, a Jira work item or a pasted AI answer against bundled **official statute texts** (Vietnam, Indonesia, Thailand). It flags articles that do not exist, laws that are repealed or not yet in force, and misquoted text — each with the official source link and excerpt — and says plainly when a citation cannot be verified.

Built for the Atlassian Codegeist 2026 hackathon (category: Apps for Business Teams; bonus: Best Agents, Best app with Atlassian MCP).

## Features
- Rovo Agent `CiteCheck Legal Citations` with 6 actions and the `citation-audit` skill
- `rovo:mcp` server exposing the verification tools to Rovo Studio agents and MCP clients
- Confluence byline status and Jira issue panel (UI Kit)
- Write-back after confirmation: report comment + `citecheck-flagged` / `citecheck-verified` label
- Deterministic verification inside Forge — no external API calls, no keys, no data egress
- **Misattribution check (H3)**: when a paraphrase matches another article of the same law far better than the cited one, CiteCheck flags it and suggests the article ("did you mean article 9?"); long statements with almost no overlap with the cited article are flagged as unsupported (H4); contradicting figures (days, hours, %, amounts) are shown as advisory notes (H7)
- **Organisation sources**: admins register Confluence pages (internal policies, clause libraries) as extra sources; citations such as "Policy POL-7 §3" are verified the same way (Custom Entity Store)
- **Automatic re-checks**: Confluence page / Jira work-item updates under `legal-review` (or already checked) are re-verified through Forge events → async queue → consumer
- **Audit trail** of every check (Custom Entity Store) with CSV export (formula-injection safe)
- Hallucination taxonomy H1–H7 (non-existent article, non-existent law/case, misattribution, fabricated content, temporal error, translation drift, numeric error)

## Run the tests (no Atlassian account needed)
```bash
node --test "test/*.test.js"                 # golden parity vs reference verifier + unit/handler tests
node tools/validate-manifest.cjs  # offline manifest validation with the Forge CLI's validator
node scripts/build-corpus.mjs     # rebuild src/corpus from the statute cache
npm run eval                      # offline eval on eval/data → eval/report.json + eval/REPORT.md (< 5 s)
```

## Evaluation (silver-standard labels — not yet human-audited)
`eval/run-eval.mjs` scores the verifier on 123 LLM answers / 809 citations with a fixed 70/30 split by question
(stratified by country; thresholds were tuned on the 70% dev split only). Held-out (30%) results — see `eval/REPORT.md`:

| mode | dev (70%) P / R | held-out (30%) P / R |
|---|---|---|
| rule checks only (`enhanced`) | 99.0% / 34.6% | 100.0% / 33.9% (39 TP / 0 FP of 115) |
| + content checks, H7 numbers flag (`crossref_prereg`) | 95.7% / 54.9% | 87.9% / 44.3% |
| + content checks + version pinning, no glossary (`crossref_noanchor`, ablation) | 96.1% / 51.4% | 95.9% / 40.9% |
| **shipped default (`crossref`)**: + zh→local glossary anchors | 96.3% / 54.5% | **94.1% / 41.7%** (48 TP / 3 FP; P 95% CI 84–98%) |

Phase 3 added same-name-law version pinning, section-heading inheritance and a curated Chinese→Vietnamese/
Indonesian/Thai legal-term glossary (`src/core/glossary.js`, deterministic, no LLM). All parameters were frozen on
the dev split and committed before the held-out split was scored once. They lift dev recall from 45.8% to 54.5%,
but on held-out data the gain is only +1 TP (+1 FP); the version-pinning rules find no extra cases there.
The project target (recall ≥ 45% at precision ≥ 95% on held-out data) is **still not reached** — the dev gains did
not generalise. Remaining misses: cross-language paraphrases with few glossary concepts, Thai/Indonesian
answers (held-out recall TH 19%, ID 0%, VN 66%), and silver labels that a human review (`eval/review/`) may revise.

## Deploy (needs an Atlassian developer account)
```bash
npm install
forge login                       # Atlassian email + API token
forge register                    # replaces the placeholder app.id
forge deploy -e development
forge install --site <your-site>.atlassian.net --product confluence
forge install --site <your-site>.atlassian.net --product jira
```

## Reuse disclosure
This Forge app, its manifest, Rovo agent/skill/MCP modules, actions, UI, storage, renderers and tests were created for Codegeist 2026 (after 2026-10-27). It reuses work from our earlier, unpublished ASEAN legal-AI citation-verifier prototype (October 2026):
- **Algorithm:** the rule-based verification logic (citation extraction, law linking, article existence, in-force check, quote similarity) was originally written in Python and has been **ported to JavaScript** here (`src/core/`). `tools/gen_golden.py` runs the original implementation to produce parity fixtures.
- **Data:** the per-article statute cache (30 laws) — official texts fetched 2026-10-15..18 from government gazettes — bundled as `src/corpus/laws.js` by `scripts/build-corpus.mjs`.
- **Taxonomy/eval:** the H1–H7 hallucination taxonomy and the multilingual citation-hallucination evaluation set (123 answers from 4 LLMs, 809 citations), bundled unchanged as `eval/data/dataset.jsonl` with its `SCHEMA.md`. Its labels are silver standard (rule facts + an LLM judge).

New in this project (not in the prototype): the misattribution / unsupported-statement / numeric checks (`src/core/crossref.js`, `numbers.js`, `contentChecks.js`), the JS eval runner and split, organisation sources, event re-checks, audit + CSV, and all Forge modules and UI.

## Data sources
- Vietnam: Công báo (congbao.chinhphu.vn) — e.g. Luật 91/2025/QH15 (Personal Data Protection).
- Indonesia: JDIH BPK (peraturan.bpk.go.id) — e.g. UU 27/2022 (Personal Data Protection). Some articles are missing due to OCR gaps → reported as unverifiable.
- Thailand: official Thai texts; the PDPA B.E. 2562 English text is an **unofficial translation** (hosted on dol.go.th) and is labelled as such.
Each law record carries its source URL and fetch date (see `src/corpus/index.json`).

## Limitations
Coverage is limited to the bundled laws; case-law databases are not connected; paraphrases in another language than the official text are not compared (the agent may add an advisory semantic note); the misattribution check is lexical and can be wrong — it suggests, a reviewer decides. CiteCheck does not give legal advice.

## License
MIT (see LICENSE). Statute texts are official government publications; see Data sources.

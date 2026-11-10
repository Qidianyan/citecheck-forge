# Indonesia / Thailand miss analysis (phase 4, dev split only)

**Scope.** Only the 70% dev split was used, through `eval/analysis/dev-error-analysis.mjs ID|TH`, which skips test-split rows. Per-row output is in `dev_misses_ID.json` and `dev_misses_TH.json`. The silver labels were not changed.

## Dev positives caught (shipped `crossref` mode)
| | before phase 4 (c0ab3b4) | after phase 4 |
|---|---|---|
| Indonesia (80 positives) | 41 | 44 |
| Thailand (45 positives) | 8 | 12 |
| All countries | 156 TP / 6 FP (P 96.3%, R 54.5%) | 165 TP / 8 FP (P 95.4%, R 57.7%) |

## Causes found, and what was fixed
1. **Quotation on the line after the citation** (fixed; generalisable). Many Indonesian and Thai answers put the article on one line (`**Pasal 6**`, `มาตรา 37 วรรคสาม บัญญัติว่า:`) and the quoted text in a Markdown block-quote on the next line (`> "…"`). The extractor only read quotes on the citation line, so these were never compared with the official text. In enhanced mode we now attach the first quotation in the block-quote right after a citation line. Conditions: the line has exactly one citation and no quote of its own, and the block-quote does not cite another article first. A quote score in the gray band falls back to "paraphrase", so this never turns a decided verdict into "unverifiable". Effect on dev: +7 TP (TH 8→12, ID 41→44) and +2 FP. Both new FPs come from one Thai answer whose block-quote is not the official wording, while the silver label calls it consistent. That row should go to human review.
2. **Article ranges and lists** (fixed; generalisable; pi task K). `第67–74条`, `第78-82条`, `第五条至第十条`, `Pasal 5 sampai dengan Pasal 13`, `Điều 5, 6 và 7`, `มาตรา ๗๘-๘๒` and similar forms were missed or cut down to their endpoints. Enhanced mode now expands them into one row per article. Each row is marked `multi`, and the misattribution check skips range lines. This fixed 9 ID and 3 TH "not extracted" misses, but those claims are vague ("criminal penalties apply"), so detection gained only +2 TP. The main gain is extraction recall.
3. **Thai numerals, `มาตรา`, `วรรค`, and OCR-damaged sara am** (`ก าหนด`, `มำตรำ`): already handled by `normalize.js` and `extract.js`. Not a cause.
4. **Corpus coverage**: every missed ID/TH positive cites a law and an article that exist in the bundled corpus. Not a cause.

## What remains (not fixable deterministically)
- **Indonesia, 33 misses:** the article is right and the claim is a paraphrase with no quote; 17 of the 33 are in Chinese. The silver judge marked 29 as NOT_SUPPORTED and 4 as CONTRADICTED. Typical example: a summary of the Pasal 46 breach notice that adds content the article does not contain. Lexical matching cannot tell a faithful paraphrase from a subtly wrong one.
- **Thailand, 33 misses:** the same pattern; 25 of the 33 are in Chinese, and 14 are CONTRADICTED. A typical case: lists of PDPA Section 24 lawful bases that put "consent" among them (consent is in Section 19) or reword a ground slightly.
- These need semantic judgment, either an optional LLM check (off by default) or human review. Some silver labels are probably wrong too, so the review pack (`eval/review/`) includes such rows.

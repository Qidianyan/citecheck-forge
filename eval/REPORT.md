# CiteCheck eval report

Generated: 2026-11-10T21:06:38.282Z
Dataset sha256: `1329fd83864cb66a2585fbfdc37886da796ef32f3babdd7cb8e5236f4037cee5`
123 answers, 809 citations, 10 held-out test questions.

## Modes

- **legacy** — Reference behaviour of the original Python verifier (rule checks only).
- **enhanced** — Rule checks + English law names, per-line country cues, translation fallback.
- **crossref_prereg** — Phase-2 pre-registered variant (H7 numbers flag), now on the phase-3 linking + anchors code.
- **crossref_noanchor** — Ablation: shipped default without the zh→local glossary anchors (phase-3 linking rules only).
- **crossref** — Shipped default (phase 3): content checks with H7 advisory, same-name-law version pinning + heading inheritance, and zh→local glossary anchors for Chinese claims. Phase 4 adds block-quote quotes and article range/list expansion (frozen at 4485595). The 30% test split has been SEEN since phase 3, so its numbers are no longer a clean held-out estimate; see eval/fresh/FRESH_REPORT.md for the fresh held-out set. (Phase-2 history: shipped crossref test P 95.9 / R 40.9, post-hoc; crossref_prereg test P 89.3 / R 43.5.)

Acceptance target: recall ≥ 45% at precision ≥ 95% on the held-out test split. Honest status: no configuration reaches both on the test split (see headline).

## Headline (per mode × split)

| mode | split | P | P CI95 | R | R CI95 | F1 | extraction recall |
|---|---|---|---|---|---|---|---|
| legacy | dev | 98.9% | [93.8%, 99.8%] | 30.1% | [25.0%, 35.6%] | 46.1% | 80.3% |
| legacy | test | 100.0% | [91.0%, 100.0%] | 33.9% | [25.9%, 43.0%] | 50.6% | 92.3% |
| legacy | all | 99.2% | [95.6%, 99.9%] | 31.2% | [26.8%, 35.9%] | 47.4% | 83.9% |
| enhanced | dev | 96.6% | [91.5%, 98.7%] | 39.5% | [34.0%, 45.3%] | 56.1% | 86.7% |
| enhanced | test | 97.7% | [88.2%, 99.6%] | 37.4% | [29.1%, 46.5%] | 54.1% | 94.3% |
| enhanced | all | 96.9% | [92.9%, 98.7%] | 38.9% | [34.3%, 43.8%] | 55.5% | 89.0% |
| crossref_prereg | dev | 94.9% | [90.5%, 97.3%] | 58.0% | [52.3%, 63.6%] | 72.0% | 86.7% |
| crossref_prereg | test | 87.9% | [77.9%, 93.7%] | 50.4% | [41.4%, 59.4%] | 64.1% | 94.3% |
| crossref_prereg | all | 92.9% | [89.0%, 95.5%] | 55.9% | [51.0%, 60.6%] | 69.8% | 89.0% |
| crossref_noanchor | dev | 95.1% | [90.7%, 97.5%] | 54.5% | [48.8%, 60.2%] | 69.3% | 86.7% |
| crossref_noanchor | test | 94.4% | [84.9%, 98.1%] | 44.3% | [35.6%, 53.5%] | 60.4% | 94.3% |
| crossref_noanchor | all | 95.0% | [91.2%, 97.2%] | 51.6% | [46.7%, 56.5%] | 66.9% | 89.0% |
| crossref | dev | 95.4% | [91.1%, 97.6%] | 57.7% | [51.9%, 63.3%] | 71.9% | 86.7% |
| crossref | test | 93.2% | [83.8%, 97.3%] | 47.8% | [38.9%, 56.9%] | 63.2% | 94.3% |
| crossref | all | 94.8% | [91.2%, 97.0%] | 54.9% | [50.0%, 59.7%] | 69.5% | 89.0% |

## Per-group recall (test split)

### legacy

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 0 | 0 | 11 | 0.0% |
| TH | 100 | 68 | 0 | 0 | 43 | 0.0% |
| VN | 94 | 78 | 39 | 0 | 22 | 63.9% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 39 | 0 | 41 | 48.8% |
| zh | 97 | 60 | 0 | 0 | 35 | 0.0% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 0 | 0.0% |
| H4 | 9 | 0 | 0.0% |
| H5 | 41 | 38 | 92.7% |
| H6 | 5 | 0 | 0.0% |
| H7 | 7 | 0 | 0.0% |

### enhanced

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 2 | 1 | 9 | 18.2% |
| TH | 100 | 68 | 0 | 0 | 43 | 0.0% |
| VN | 94 | 78 | 41 | 0 | 20 | 67.2% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 43 | 1 | 37 | 53.8% |
| zh | 97 | 60 | 0 | 0 | 35 | 0.0% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 0 | 0.0% |
| H4 | 9 | 1 | 11.1% |
| H5 | 41 | 40 | 97.6% |
| H6 | 5 | 1 | 20.0% |
| H7 | 7 | 0 | 0.0% |

### crossref_prereg

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 2 | 3 | 9 | 18.2% |
| TH | 100 | 68 | 11 | 0 | 32 | 25.6% |
| VN | 94 | 78 | 45 | 5 | 16 | 73.8% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 53 | 7 | 27 | 66.3% |
| zh | 97 | 60 | 5 | 1 | 30 | 14.3% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 13 | 25.0% |
| H4 | 9 | 1 | 11.1% |
| H5 | 41 | 40 | 97.6% |
| H6 | 5 | 1 | 20.0% |
| H7 | 7 | 2 | 28.6% |

### crossref_noanchor

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 2 | 2 | 9 | 18.2% |
| TH | 100 | 68 | 7 | 0 | 36 | 16.3% |
| VN | 94 | 78 | 42 | 1 | 19 | 68.9% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 51 | 3 | 29 | 63.7% |
| zh | 97 | 60 | 0 | 0 | 35 | 0.0% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 8 | 15.4% |
| H4 | 9 | 1 | 11.1% |
| H5 | 41 | 40 | 97.6% |
| H6 | 5 | 1 | 20.0% |
| H7 | 7 | 0 | 0.0% |

### crossref

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 2 | 3 | 9 | 18.2% |
| TH | 100 | 68 | 11 | 0 | 32 | 25.6% |
| VN | 94 | 78 | 42 | 1 | 19 | 68.9% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 51 | 3 | 29 | 63.7% |
| zh | 97 | 60 | 4 | 1 | 31 | 11.4% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 11 | 21.2% |
| H4 | 9 | 1 | 11.1% |
| H5 | 41 | 40 | 97.6% |
| H6 | 5 | 1 | 20.0% |
| H7 | 7 | 1 | 14.3% |

## Top error classes (test split)

Five largest gold→pred cells among false negatives (incl. MISSED) and all false positives.

### legacy

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 66 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 7 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08, QIDZH03-qwen3.8-flash:C06 |
| 3 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |

### enhanced

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 65 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 3 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 1 | QIDID02-glm-5.3-flash:C01 |
| 4 | NOT_IN_FORCE → MISSED | fn | 1 | QVNZH05-glm-5.3-flash:C04 |

### crossref_prereg

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 50 | QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04, QVNVI01-qwen3.8-flash:C05, QVNVI01-qwen3.8-flash:C07 |
| 2 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 8 | QVNVI01-deepseek-v4.1-flash:C01, QVNVI01-deepseek-v4.1-flash:C02, QVNVI01-deepseek-v4.1-flash:C03, QVNVI01-mimo-v2.6-flash:C06, QVNVI01-qwen3.8-flash:C06, QIDID02-glm-5.3-flash:C01, QIDID02-mimo-v2.6-flash:C01, QIDZH03-mimo-v2.6-flash:C04 |
| 3 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 4 | NOT_IN_FORCE → MISSED | fn | 1 | QVNZH05-glm-5.3-flash:C04 |

### crossref_noanchor

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 57 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 3 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 3 | QVNVI01-qwen3.8-flash:C06, QIDID02-glm-5.3-flash:C01, QIDID02-mimo-v2.6-flash:C01 |
| 4 | NOT_IN_FORCE → MISSED | fn | 1 | QVNZH05-glm-5.3-flash:C04 |

### crossref

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 53 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 3 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 4 | QVNVI01-qwen3.8-flash:C06, QIDID02-glm-5.3-flash:C01, QIDID02-mimo-v2.6-flash:C01, QIDZH03-mimo-v2.6-flash:C04 |
| 4 | NOT_IN_FORCE → MISSED | fn | 1 | QVNZH05-glm-5.3-flash:C04 |

## Split

Fixed 70/30 split by question id, stratified by country: within each country the qids are ordered by sha256(qid) and the first round(30%) go to "test"; the split is label-independent.

## Caveat

Labels are silver standard (rule facts + LLM judge), not yet human-audited.

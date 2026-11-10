# CiteCheck eval report

Generated: 2026-11-10T19:36:09.132Z
Dataset sha256: `1329fd83864cb66a2585fbfdc37886da796ef32f3babdd7cb8e5236f4037cee5`
123 answers, 809 citations, 10 held-out test questions.

## Modes

- **legacy** — Reference behaviour of the original Python verifier (rule checks only).
- **enhanced** — Rule checks + English law names, per-line country cues, translation fallback.
- **crossref_prereg** — Enhanced + content checks (H3 misattribution, H4 unsupported, H7 numbers flag). Thresholds fixed on the dev split before scoring the test split.
- **crossref** — Shipped default: as crossref_prereg but numeric (H7) findings are advisory notes only. Chosen after seeing test results (post-hoc).

Acceptance target: recall ≥ 45% at precision ≥ 95% on the held-out test split. Honest status: no configuration reaches both on the test split (see headline).

## Headline (per mode × split)

| mode | split | P | P CI95 | R | R CI95 | F1 | extraction recall |
|---|---|---|---|---|---|---|---|
| legacy | dev | 98.9% | [93.8%, 99.8%] | 30.1% | [25.0%, 35.6%] | 46.1% | 80.3% |
| legacy | test | 100.0% | [91.0%, 100.0%] | 33.9% | [25.9%, 43.0%] | 50.6% | 92.3% |
| legacy | all | 99.2% | [95.6%, 99.9%] | 31.2% | [26.8%, 35.9%] | 47.4% | 83.9% |
| enhanced | dev | 98.9% | [93.8%, 99.8%] | 30.1% | [25.0%, 35.6%] | 46.1% | 80.1% |
| enhanced | test | 100.0% | [91.0%, 100.0%] | 33.9% | [25.9%, 43.0%] | 50.6% | 92.3% |
| enhanced | all | 99.2% | [95.6%, 99.9%] | 31.2% | [26.8%, 35.9%] | 47.4% | 83.8% |
| crossref_prereg | dev | 95.0% | [90.1%, 97.6%] | 46.9% | [41.1%, 52.6%] | 62.8% | 80.1% |
| crossref_prereg | test | 89.3% | [78.5%, 95.0%] | 43.5% | [34.8%, 52.6%] | 58.5% | 92.3% |
| crossref_prereg | all | 93.4% | [89.0%, 96.1%] | 45.9% | [41.1%, 50.8%] | 61.5% | 83.8% |
| crossref | dev | 95.6% | [90.8%, 98.0%] | 45.8% | [40.1%, 51.6%] | 61.9% | 80.1% |
| crossref | test | 95.9% | [86.3%, 98.9%] | 40.9% | [32.3%, 50.0%] | 57.3% | 92.3% |
| crossref | all | 95.7% | [91.7%, 97.8%] | 44.4% | [39.6%, 49.3%] | 60.6% | 83.8% |

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

### crossref_prereg

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 0 | 1 | 11 | 0.0% |
| TH | 100 | 68 | 7 | 0 | 36 | 16.3% |
| VN | 94 | 78 | 43 | 5 | 18 | 70.5% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 49 | 6 | 31 | 61.3% |
| zh | 97 | 60 | 1 | 0 | 34 | 2.9% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 10 | 19.2% |
| H4 | 9 | 0 | 0.0% |
| H5 | 41 | 38 | 92.7% |
| H6 | 5 | 0 | 0.0% |
| H7 | 7 | 1 | 14.3% |

### crossref

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 0 | 1 | 11 | 0.0% |
| TH | 100 | 68 | 7 | 0 | 36 | 16.3% |
| VN | 94 | 78 | 40 | 1 | 21 | 65.6% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 47 | 2 | 33 | 58.8% |
| zh | 97 | 60 | 0 | 0 | 35 | 0.0% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 8 | 15.4% |
| H4 | 9 | 0 | 0.0% |
| H5 | 41 | 38 | 92.7% |
| H6 | 5 | 0 | 0.0% |
| H7 | 7 | 0 | 0.0% |

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
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 66 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 7 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08, QIDZH03-qwen3.8-flash:C06 |
| 3 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |

### crossref_prereg

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 55 | QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04, QVNVI01-qwen3.8-flash:C05, QVNVI01-qwen3.8-flash:C07 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 7 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08, QIDZH03-qwen3.8-flash:C06 |
| 3 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 6 | QVNVI01-deepseek-v4.1-flash:C01, QVNVI01-deepseek-v4.1-flash:C02, QVNVI01-deepseek-v4.1-flash:C03, QVNVI01-mimo-v2.6-flash:C06, QVNVI01-qwen3.8-flash:C06, QIDID02-mimo-v2.6-flash:C01 |
| 4 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |

### crossref

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 58 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 7 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08, QIDZH03-qwen3.8-flash:C06 |
| 3 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |
| 4 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 2 | QVNVI01-qwen3.8-flash:C06, QIDID02-mimo-v2.6-flash:C01 |

## Split

Fixed 70/30 split by question id, stratified by country: within each country the qids are ordered by sha256(qid) and the first round(30%) go to "test"; the split is label-independent.

## Caveat

Labels are silver standard (rule facts + LLM judge), not yet human-audited.

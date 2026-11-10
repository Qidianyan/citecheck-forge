# CiteCheck eval report

Generated: 2026-11-10T19:42:14.991Z
Dataset sha256: `1329fd83864cb66a2585fbfdc37886da796ef32f3babdd7cb8e5236f4037cee5`
123 answers, 809 citations, 10 held-out test questions.

## Modes

- **legacy** — Reference behaviour of the original Python verifier (rule checks only).
- **enhanced** — Rule checks + English law names, per-line country cues, translation fallback.
- **crossref_prereg** — Phase-2 pre-registered variant (H7 numbers flag), now on the phase-3 linking + anchors code.
- **crossref_noanchor** — Ablation: shipped default without the zh→local glossary anchors (phase-3 linking rules only).
- **crossref** — Shipped default (phase 3): content checks with H7 advisory, same-name-law version pinning + heading inheritance, and zh→local glossary anchors for Chinese claims. All phase-3 parameters frozen on the 70% dev split before the 30% test split was scored once. (Phase-2 history: shipped crossref test P 95.9 / R 40.9, post-hoc; crossref_prereg test P 89.3 / R 43.5.)

Acceptance target: recall ≥ 45% at precision ≥ 95% on the held-out test split. Honest status: no configuration reaches both on the test split (see headline).

## Headline (per mode × split)

| mode | split | P | P CI95 | R | R CI95 | F1 | extraction recall |
|---|---|---|---|---|---|---|---|
| legacy | dev | 98.9% | [93.8%, 99.8%] | 30.1% | [25.0%, 35.6%] | 46.1% | 80.3% |
| legacy | test | 100.0% | [91.0%, 100.0%] | 33.9% | [25.9%, 43.0%] | 50.6% | 92.3% |
| legacy | all | 99.2% | [95.6%, 99.9%] | 31.2% | [26.8%, 35.9%] | 47.4% | 83.9% |
| enhanced | dev | 99.0% | [94.6%, 99.8%] | 34.6% | [29.3%, 40.3%] | 51.3% | 81.2% |
| enhanced | test | 100.0% | [91.0%, 100.0%] | 33.9% | [25.9%, 43.0%] | 50.6% | 93.1% |
| enhanced | all | 99.3% | [96.0%, 99.9%] | 34.4% | [29.9%, 39.2%] | 51.1% | 84.8% |
| crossref_prereg | dev | 95.7% | [91.5%, 97.9%] | 54.9% | [49.1%, 60.6%] | 69.8% | 81.2% |
| crossref_prereg | test | 87.9% | [77.1%, 94.0%] | 44.3% | [35.6%, 53.5%] | 59.0% | 93.1% |
| crossref_prereg | all | 93.7% | [89.7%, 96.2%] | 51.9% | [47.0%, 56.7%] | 66.8% | 84.8% |
| crossref_noanchor | dev | 96.1% | [91.7%, 98.2%] | 51.4% | [45.6%, 57.1%] | 67.0% | 81.2% |
| crossref_noanchor | test | 95.9% | [86.3%, 98.9%] | 40.9% | [32.3%, 50.0%] | 57.3% | 93.1% |
| crossref_noanchor | all | 96.0% | [92.4%, 98.0%] | 48.4% | [43.5%, 53.3%] | 64.3% | 84.8% |
| crossref | dev | 96.3% | [92.2%, 98.3%] | 54.5% | [48.8%, 60.2%] | 69.6% | 81.2% |
| crossref | test | 94.1% | [84.1%, 98.0%] | 41.7% | [33.1%, 50.9%] | 57.8% | 93.1% |
| crossref | all | 95.8% | [92.2%, 97.8%] | 50.9% | [46.0%, 55.7%] | 66.4% | 84.8% |

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
| ID | 52 | 19 | 0 | 2 | 11 | 0.0% |
| TH | 100 | 68 | 8 | 0 | 35 | 18.6% |
| VN | 94 | 78 | 43 | 5 | 18 | 70.5% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 49 | 6 | 31 | 61.3% |
| zh | 97 | 60 | 2 | 1 | 33 | 5.7% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 11 | 21.2% |
| H4 | 9 | 0 | 0.0% |
| H5 | 41 | 38 | 92.7% |
| H6 | 5 | 0 | 0.0% |
| H7 | 7 | 1 | 14.3% |

### crossref_noanchor

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

### crossref

#### By country

| country | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| ID | 52 | 19 | 0 | 2 | 11 | 0.0% |
| TH | 100 | 68 | 8 | 0 | 35 | 18.6% |
| VN | 94 | 78 | 40 | 1 | 21 | 65.6% |

#### By question language

| language | n | verifiable | tp | fp | fn | recall |
|---|---|---|---|---|---|---|
| local | 149 | 105 | 47 | 2 | 33 | 58.8% |
| zh | 97 | 60 | 1 | 1 | 34 | 2.9% |

#### By gold hallucination type (caught = pred is a hallucination verdict)

| h_type | n | caught | recall |
|---|---|---|---|
| H1 | 1 | 1 | 100.0% |
| H3 | 52 | 9 | 17.3% |
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
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 67 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 3 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |

### crossref_prereg

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 55 | QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04, QVNVI01-qwen3.8-flash:C05, QVNVI01-qwen3.8-flash:C07 |
| 2 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 7 | QVNVI01-deepseek-v4.1-flash:C01, QVNVI01-deepseek-v4.1-flash:C02, QVNVI01-deepseek-v4.1-flash:C03, QVNVI01-mimo-v2.6-flash:C06, QVNVI01-qwen3.8-flash:C06, QIDID02-mimo-v2.6-flash:C01, QIDZH03-mimo-v2.6-flash:C04 |
| 3 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 4 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |

### crossref_noanchor

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 59 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 3 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |
| 4 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 2 | QVNVI01-qwen3.8-flash:C06, QIDID02-mimo-v2.6-flash:C01 |

### crossref

| rank | gold → pred | class | count | ids (aid:cid, max 10) |
|---|---|---|---|---|
| 1 | CONTENT_MISMATCH → EXISTS_UNQUOTED | fn | 58 | QVNVI01-deepseek-v4.1-flash:C04, QVNVI01-glm-5.3-flash:C09, QVNVI01-mimo-v2.6-flash:C02, QVNVI01-mimo-v2.6-flash:C03, QVNVI01-mimo-v2.6-flash:C04, QVNVI01-mimo-v2.6-flash:C05, QVNVI01-mimo-v2.6-flash:C07, QVNVI01-qwen3.8-flash:C02, QVNVI01-qwen3.8-flash:C03, QVNVI01-qwen3.8-flash:C04 |
| 2 | CONTENT_MISMATCH → MISSED | fn | 6 | QVNVI01-glm-5.3-flash:C10, QVNVI02-glm-5.3-flash:C14, QIDID02-qwen3.8-flash:C02, QIDZH03-deepseek-v4.1-flash:C06, QIDZH03-deepseek-v4.1-flash:C07, QIDZH03-deepseek-v4.1-flash:C08 |
| 3 | EXISTS_CONSISTENT → CONTENT_MISMATCH | fp | 3 | QVNVI01-qwen3.8-flash:C06, QIDID02-mimo-v2.6-flash:C01, QIDZH03-mimo-v2.6-flash:C04 |
| 4 | NOT_IN_FORCE → MISSED | fn | 3 | QVNVI02-qwen3.8-flash:C12, QVNVI02-qwen3.8-flash:C13, QVNZH05-glm-5.3-flash:C04 |

## Split

Fixed 70/30 split by question id, stratified by country: within each country the qids are ordered by sha256(qid) and the first round(30%) go to "test"; the split is label-independent.

## Caveat

Labels are silver standard (rule facts + LLM judge), not yet human-audited.

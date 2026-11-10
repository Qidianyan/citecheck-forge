# 评测集 Schema 与幻觉类型标注规范 v0.1

每行一条 JSON（eval/samples.jsonl）：
| 字段 | 类型 | 说明 |
|---|---|---|
| id | str | S001… |
| lang / country | str | vi/th/id/en；VN/TH/ID |
| origin | enum | `real_quote_from_official_cache`（引文逐字取自缓存官方文本）/ `model_output`（真实模型回答，需记录 model、prompt、时间）/ `CONSTRUCTED_NEGATIVE`（人为构造的假引用，**必须**带 note） |
| question / model / prompt / collected_at | str | origin=model_output 时必填 |
| answer_text | str | 待核验的回答文本 |
| citations[] | obj | law_id（未缓存则填原文写法）、article、clause、quoted_text、case_no |
| gold.verdict | enum | EXISTS_CONSISTENT / EXISTS_UNQUOTED / CONTENT_MISMATCH / ARTICLE_NOT_FOUND / NOT_IN_FORCE / UNVERIFIABLE |
| gold.hallucination_types[] | enum | 见下 |
| evidence / source_version | str | 官方原文 URL 与版本日期 |
| annotator / review_status | str | 双人标注 + 仲裁：pending_human / agreed / adjudicated |

## 幻觉类型（可多选）
- **H1 不存在的条文**：法规真实，条号超出范围或不存在
- **H2 不存在的法规/案号**：法规名、文号、案号本身查无此件
- **H3 错位引用**：真实条文，但内容属于另一条/另一法规
- **H4 编造内容**：条号真实或虚构，引文/转述内容在原文中无依据
- **H5 时效错误**：引用已废止/尚未生效/已被修订的版本
- **H6 译文偏离**：跨语言转述改变了义务主体、范围、数字、情态（shall/may）
- **H7 数字错误**：罚款额、期限、刑期等与原文不符
- 无法核实不是幻觉类型：找不到官方原文时 gold.verdict=UNVERIFIABLE，不得猜测。

## 规则
1. 法条内容只能来自 cache 中的官方文本；严禁凭记忆写“真实条文”。
2. 构造的阴性样本 origin 必须为 CONSTRUCTED_NEGATIVE，note 写明“人为构造”，评测报告中单独统计。
3. 正样本引文自动从缓存截取后，仍需人工对照 PDF 复核（OCR 错字）。
4. 300 条目标的主体应为 `model_output`（真实模型回答），构造样本仅用于覆盖稀有幻觉类型。

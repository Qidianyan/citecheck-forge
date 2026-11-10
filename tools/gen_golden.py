"""Generate golden fixtures for the JS port from the legacy Python reference verifier
(rule mode only, no LLM). Reference implementation: earlier ASEAN project (see README).
Usage: python3 tools/gen_golden.py [legacy_root]  -> test/fixtures/golden.jsonl"""
import json, pathlib, sys
LEG = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/workspace/competitions/demos/14_东盟法律")
sys.path.insert(0, str(LEG / "verifier"))
import verify  # noqa
AS_OF = "2026-11-10"
docs = []
for p in sorted((LEG / "examples").glob("*.txt")):
    docs.append(("example:" + p.stem, p.read_text(encoding="utf-8")))
for line in (LEG / "eval" / "samples.jsonl").read_text(encoding="utf-8").splitlines():
    s = json.loads(line); docs.append(("sample:" + s["id"], s["answer_text"]))
for line in (LEG / "eval" / "answers.jsonl").read_text(encoding="utf-8").splitlines():
    a = json.loads(line); docs.append(("answer:" + a["aid"], a["answer"]))
out = pathlib.Path(__file__).resolve().parent.parent / "test" / "fixtures" / "golden.jsonl"
n = 0
with out.open("w", encoding="utf-8") as f:
    for did, text in docs:
        res = verify.verify(text, AS_OF, use_llm=False)
        keep = [{k: r.get(k) for k in ("citation", "type", "article", "clause", "law", "law_hint", "verdict", "quote_score")} for r in res]
        n += len(keep)
        f.write(json.dumps({"id": did, "as_of": AS_OF, "text": text, "results": keep}, ensure_ascii=False) + "\n")
print(f"docs={len(docs)} citations={n} -> {out}")

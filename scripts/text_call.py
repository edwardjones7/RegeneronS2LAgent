"""Real text-only conversations with the live ElevenLabs agent (no phone), from the terminal.

    uv run python scripts/text_call.py --persona interested
    uv run python scripts/text_call.py --persona all          # also prints the scorecard

The server and tunnel must be running: the agent calls this backend's /tools endpoints.
Personas and grading live in app/simulate.py.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db  # noqa: E402
from app.simulate import PERSONAS, converse, grade  # noqa: E402


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--persona", default="interested", choices=[*PERSONAS, "all"])
    args = ap.parse_args()
    db.init_engine()
    ids = list(PERSONAS) if args.persona == "all" else [args.persona]
    passed = 0
    for pid in ids:
        r = await converse(pid, source="scorecard" if args.persona == "all" else "simulation")
        print(f"\n\033[1m=== {PERSONAS[pid].label} (lead {r['lead_id']}) ===\033[0m")
        for t in r["transcript"]:
            if t.get("message"):
                print(f"  {'\033[36mAVA \033[0m' if t['role'] == 'agent' else '\033[33mLEAD\033[0m'}  {t['message']}")
            for name in t.get("tool_calls") or []:
                print(f"  \033[90m  ↳ tool {name}\033[0m")
        g = grade(PERSONAS[pid], r)
        passed += g["passed"]
        for c in g["checks"]:
            print(f"  {'✅' if c['pass'] else '❌'} {c['check']} {c['detail']}")
    print(f"\n{passed}/{len(ids)} personas passed")


if __name__ == "__main__":
    asyncio.run(main())

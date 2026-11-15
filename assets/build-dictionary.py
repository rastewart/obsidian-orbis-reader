#!/usr/bin/env python3
"""Preprocess the matthewreagan Webster 1913 'compact' build into Orbis's dictionary asset.

Input : dictionary_compact.json  ({ "word": "definition", ... }, lowercase keys, clean prose)
Output: orbis-webster-1913.json   (normalized, minified, UTF-8)

Normalization: lowercase+trim keys, trim definitions, drop empties, keep the longer definition
on a key collision. The definition text (numbered senses, inline quotes) is preserved as-is —
the plugin formats it at render time.
"""
import json, sys, os

SRC = sys.argv[1] if len(sys.argv) > 1 else "mr_compact.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "orbis-webster-1913.json"

with open(SRC, encoding="utf-8") as f:
    raw = json.load(f)

out = {}
dropped = 0
collisions = 0
for k, v in raw.items():
    key = (k or "").strip().lower()
    val = (v or "").strip()
    if not key or not val:
        dropped += 1
        continue
    if key in out:
        collisions += 1
        if len(val) <= len(out[key]):
            continue
    out[key] = val

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)

size = os.path.getsize(OUT)
print(f"source entries : {len(raw)}")
print(f"output entries : {len(out)}  (dropped {dropped} empty, {collisions} key collisions)")
print(f"output size    : {size/1024/1024:.1f} MB  ({size} bytes)")
print("sample lookups :")
for w in ["book", "grace", "mercy", "computer", "rhapsody", "obsidian"]:
    d = out.get(w)
    print(f'  {w:10} -> {"(absent)" if d is None else d[:90]!r}')

import json

with open('.coverage/coverage-final.json') as f:
    data = json.load(f)

for fname, cov in data.items():
    if 'deepSignal' not in fname and 'watch' not in fname:
        continue
    short = fname.split('src/')[-1]
    branches = cov.get('b', {})
    branch_map = cov.get('branchMap', {})
    print(f"\n=== {short} ===")
    for bid, counts in branches.items():
        if any(c == 0 for c in counts):
            binfo = branch_map.get(bid, {})
            loc = binfo.get('loc', binfo.get('locations', [{}]))
            if isinstance(loc, list):
                loc = loc[0] if loc else {}
            line = loc.get('start', {}).get('line', '?')
            col = loc.get('start', {}).get('column', '?')
            btype = binfo.get('type', '?')
            zero_idxs = [i for i, c in enumerate(counts) if c == 0]
            src_path = fname.split('?')[0]
            try:
                src_lines = open(src_path).readlines()
                src_line = src_lines[int(line)-1].rstrip() if int(line) <= len(src_lines) else ''
            except Exception:
                src_line = ''
            print(f"  L{line}c{col} [{btype}] idx={zero_idxs} counts={counts}")
            print(f"    src: {src_line.strip()}")

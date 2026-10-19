# Graph Report - black-friday-2026-coral  (2026-10-19)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 22 nodes · 19 edges · 4 communities (2 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- scripts
- package.json

## God Nodes (most connected - your core abstractions)
1. `scripts` - 11 edges
2. `block:add` - 1 edges
3. `block:rename` - 1 edges
4. `build` - 1 edges
5. `check` - 1 edges
6. `deploy` - 1 edges
7. `deploy:assets` - 1 edges
8. `deploy:dry-run` - 1 edges
9. `deploy:section` - 1 edges
10. `dev` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (4 total, 2 thin omitted)

### Community 0 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, block:add, block:rename, build, check, deploy, deploy:assets, deploy:dry-run (+3 more)

### Community 1 - "package.json"
Cohesion: 0.25
Nodes (7): devDependencies, sass, name, private, type, version, sass

## Knowledge Gaps
- **16 isolated node(s):** `block:add`, `block:rename`, `build`, `check`, `deploy` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 19 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.595) - this node is a cross-community bridge._
- **What connects `block:add`, `block:rename`, `build` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
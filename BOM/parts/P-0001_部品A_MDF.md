---
type: part
part_no: P-0001
name: 部品A_MDF
material: "[[M-0001_MDF板_2.5mm]]"
drawing: "[[DW-0001_P-0001_部品A_MDF_revA]]"
units_per_material: 10
yield: 0.8
process_cost: 100
process_time_minutes: 4
unit_cost:
status: draft
tags:
  - サンプル
modified on:
---

```dataview
TABLE WITHOUT ID
  drawing AS "図面ノート",
  choice(drawing.svg, drawing.svg, "—") AS "SVG",
  choice(drawing.rev, drawing.rev, "—") AS "Rev",
  choice(drawing.status, drawing.status, "—") AS "状態",
  choice(drawing.released, drawing.released, "—") AS "リリース日",
  choice(drawing.laser_preset, drawing.laser_preset, "—") AS "加工プリセット"
WHERE file.path = this.file.path
```

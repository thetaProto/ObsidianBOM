<%*
/* ===== parts 自動連番 & 自動リネーム ===== */

const folder = "BOM/parts/";
const prefix = "P";

// 既存の P-xxxx を全部拾う
const files = app.vault.getFiles().filter(f => f.path.startsWith(folder));
const nums = files
  .map(f => f.basename.match(/^P-(\d{4})/))
  .filter(m => m)
  .map(m => Number(m[1]));

// 次の番号
const next = nums.length ? Math.max(...nums) + 1 : 1;
const id = `${prefix}-${String(next).padStart(4, "0")}`;

// 仮の名前でリネーム（後で人名を変えてもOK）
await tp.file.rename(`${id}_新規パーツ`);
-%>
---
type: part
part_no: <% id %>
name: 新規パーツ
material:
drawing:
units_per_material:
yield:
process_cost:
process_time_minutes:
unit_cost:
status: draft
tags:
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

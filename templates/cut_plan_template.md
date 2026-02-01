<%*
/* ===== cut_plans 自動連番 & 自動リネーム ===== */

const folder = "BOM/cut_plans/";
const prefix = "CP";

// 既存の CP-xxxx を全部拾う
const files = app.vault.getFiles().filter(f => f.path.startsWith(folder));
const nums = files
  .map(f => f.basename.match(/^CP-(\d{4})/))
  .filter(m => m)
  .map(m => Number(m[1]));

// 次の番号
const next = nums.length ? Math.max(...nums) + 1 : 1;
const id = `${prefix}-${String(next).padStart(4, "0")}`;

// 仮の名前でリネーム（後で名前を変えてもOK）
await tp.file.rename(`${id}_新規カットプラン`);
-%>
---
type: cut_plan
plan_no: <% id %>
material:
source_qty: 1
yield: 1
outputs:
  - part:
    qty: 1
note:
tags:
modified on:
---

## メモ

- **material**: 使用する材料ノート（BOM/materials/）へのリンク
- **source_qty**: 材料の単位あたり数量（例: 1枚、1本）
- **yield**: 歩留まり（0〜1、未設定時は1扱い）
- **outputs**: このカットから得られる部品と数量の一覧（part: 部品ノートリンク、qty: 個数）

製品ノートの components で `cut_plan: "[[このノート]]"` を指定すると、BOMビューで材料費が個数配賦で計算されます。

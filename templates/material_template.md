<%*
/ === drawings 自動連番 & 自動命名 === */

const folder = "BOM/materials/";
const prefix = "M";

// 既存の M-xxxx を全部拾う
const files = app.vault.getFiles().filter(f => f.path.startsWith(folder));
const nums = files
.map(f => f.basename.match(/^M-(\d{4})/))
.filter(m => m)
.map(m => Number(m[1]));

// 次の番号
const next = nums.length ? Math.max(...nums) + 1 : 1;
const id = `${prefix}-${String(next).padStart(4, "0")}`;

// 最終ファイル名
const filename = `${id}_新規材料`;

// リネーム実行
await tp.file.rename(filename);
-%>
---
type: material
material_no: <% id %>
name:
purchase_date:
supplier:
purchase_unit_cost:
uom: sheet
tags:
modified on:
---
<!-- uom は必須。sheet / m / pcs / g / kg などのいずれかを指定 -->

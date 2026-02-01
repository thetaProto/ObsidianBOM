<%*
/* ===== drawings 自動連番 & 自動命名 ===== */

const folder = "BOM/drawings/";
const prefix = "DW";

// 既存の DW-xxxx を全部拾う
const files = app.vault.getFiles().filter(f => f.path.startsWith(folder));
const nums = files
  .map(f => f.basename.match(/^DW-(\d{4})/))
  .filter(m => m)
  .map(m => Number(m[1]));

// 次の番号
const next = nums.length ? Math.max(...nums) + 1 : 1;
const id = `${prefix}-${String(next).padStart(4, "0")}`;

// Revを入力させる
const rev = await tp.system.prompt("Revision", "A");

// 最終ファイル名
const filename = `${id}_新規図面_rev${rev}`;

// リネーム実行
await tp.file.rename(filename);
-%>
---
type: drawing
drawing_no: <% id %>
part: 
rev: <% rev %>
released:
status: draft
svg:
thumbnail:
laser_preset:
notes:
tags:
modified on:
---

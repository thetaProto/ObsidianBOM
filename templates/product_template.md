<%*
/* ===== parts 自動連番 & 自動リネーム ===== */

const folder = "BOM/products/";
const prefix = "PR";

// 既存の PR-xxxx を全部拾う
const files = app.vault.getFiles().filter(f => f.path.startsWith(folder));
const nums = files
  .map(f => f.basename.match(/^PR-(\d{3})/))
  .filter(m => m)
  .map(m => Number(m[1]));

// 次の番号
const next = nums.length ? Math.max(...nums) + 1 : 1;
const id = `${prefix}-${String(next).padStart(3, "0")}`;

// 仮の名前でリネーム（後で人名を変えてもOK）
await tp.file.rename(`${id}_新規製品`);
-%>
---
type: product
product_no: <% id %>
name:
components:
tags:
modified on:
---

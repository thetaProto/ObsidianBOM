---
type: bom_view
product: "[[PR-001_サンプル製品]]"
process_field: process_cost
tags:
modified on:
---

```dataviewjs
async function main() {
  const PROCESS_FIELD = dv.current().process_field ?? "process_cost";
  const productRaw = dv.current().product;

  // cut_plan の source_qty と材料 uom の整合チェック用閾値（運用に合わせて調整可）
  const UOM_SOURCE_QTY_MAX = { sheet: 100, m: 500, pcs: 10000, g: 10000, kg: 10000 };

  function unwrap(v) {
    if (!v) return null;
    if (Array.isArray(v)) v = v[0];
    return v ?? null;
  }

  function stripQuotesAndBrackets(s) {
    s = String(s ?? "").trim();
    // クォート剥がし
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
    // [[...]] なら中身を抜く
    if (s.startsWith("[[") && s.endsWith("]]")) s = s.slice(2, -2).trim();
    // .md を落とす
    if (s.toLowerCase().endsWith(".md")) s = s.slice(0, -3);
    return s.trim();
  }

  function toMaterialPageArg(v) {
    v = unwrap(v);
    if (!v) return null;

    // Dataview Link 型
    if (typeof v === "object" && v.path) return v.path;

    const s = stripQuotesAndBrackets(v);
    if (!s) return null;

    // 既にパス指定なら尊重、そうでなければ materials に寄せる
    if (s.includes("/")) return s;
    return `BOM/materials/${s}`;
  }

  function toProductPageArg(v) {
    v = unwrap(v);
    if (!v) return null;

    // Dataview Link 型（推奨）
    if (typeof v === "object" && v.path) return v.path;

    const s = stripQuotesAndBrackets(v);
    if (!s) return null;

    // productsフォルダに解決
    return `BOM/products/${s}`;
  }

  function toCutPlanPageArg(v) {
    v = unwrap(v);
    if (!v) return null;

    // Dataview Link 型
    if (typeof v === "object" && v.path) return v.path;

    const s = stripQuotesAndBrackets(v);
    if (!s) return null;

    // 既にパス指定なら尊重、そうでなければcut_plansに寄せる
    if (s.includes("/")) return s;
    return `BOM/cut_plans/${s}`;
  }

  const pageArg = toProductPageArg(productRaw);
  if (!pageArg) {
    dv.paragraph("frontmatter の product を設定してください。例: product: [[PR-001_テスト箱]]");
    return;
  }

  const prod = dv.page(pageArg);
  if (!prod) {
    dv.paragraph(`製品ノートが見つかりません: ${String(pageArg)}`);
    return;
  }

  // ===== purchases から材料別の qty 加重平均単価を作る（1回だけ）=====
  // キーを matPage.file.path に統一（.md 付き）して、後段の参照と確実に一致させる
  const purchaseAggByMatPath = new Map(); // matFilePath -> { totalAmount, totalQty }

  // purchases を走査（type: purchase のみ）
  const purchasePages = dv.pages('"BOM/purchases"').where(p => p.type === "purchase");

  for (const p of purchasePages) {
    // purchase.material を materials 配下へ解決してページ取得
    const matArg = toMaterialPageArg(p.material);
    const matPage = matArg ? dv.page(matArg) : null;

    // キーは「実際のファイルパス（.md付き）」に固定
    const matKey = matPage?.file?.path;
    if (!matKey) continue;

    const qty = Number(p.qty ?? 0);
    const amt = Number(p.total_amount ?? 0);

    if (!(qty > 0) || !(amt >= 0)) continue;

    const cur = purchaseAggByMatPath.get(matKey) ?? { totalAmount: 0, totalQty: 0 };
    cur.totalAmount += amt;
    cur.totalQty += qty;
    purchaseAggByMatPath.set(matKey, cur);
  }

  function effectiveMaterialUnitCost(matPage) {
    if (!matPage) return null;

    // --- avg_unit_cost ---
    const avg = matPage.avg_unit_cost;
    const nAvg = Number(avg);
    if (Number.isFinite(nAvg)) {
      return { unitCost: nAvg, source: "avg_unit_cost" };
    }

    // --- purchase_unit_cost ---
    const pur = matPage.purchase_unit_cost;
    const nPur = Number(pur);
    if (Number.isFinite(nPur)) {
      return { unitCost: nPur, source: "purchase_unit_cost" };
    }

    // --- purchases から平均 ---
    const matPath = matPage.file?.path;
    if (matPath && purchaseAggByMatPath.has(matPath)) {
      const agg = purchaseAggByMatPath.get(matPath);
      if (agg.totalQty > 0) {
        return {
          unitCost: agg.totalAmount / agg.totalQty,
          source: "purchases_avg"
        };
      }
    }

    return null;
  }

  // ===== cut_plan 個数配賦：部品1個あたり材料費 =====
  // 戻り値：
  // { unitMatCost, warnings:[], usedAvgCost:boolean, matUnitCost, sourceQty, cpYield, outTotalQty, matchedOutQty, cpPage, matPage }
  function computeUnitMatCostFromCutPlan(cpPage, partPage) {
    const warnings = [];

    if (!cpPage) return { error: "cut_plan が解決できない", warnings };

    const matArg = toMaterialPageArg(cpPage.material);
    const matPage = matArg ? dv.page(matArg) : null;
    if (!matPage) return { error: "cut_plan.material 未設定/解決不能", warnings };

    const costInfo = effectiveMaterialUnitCost(matPage);
    if (!costInfo || costInfo.unitCost === null || Number.isNaN(costInfo.unitCost)) {
      return { error: "material 単価未設定（avg_unit_cost / purchase_unit_cost / purchases）", warnings };
    }

    const matUnitCost = costInfo.unitCost;
    const usedAvgCost = (costInfo.source === "avg_unit_cost" || costInfo.source === "purchases_avg"); // 表示用途なら好きに

    const sourceQty = Number(cpPage.source_qty ?? 1);
    if (!Number.isFinite(sourceQty) || sourceQty <= 0) {
      return { error: "cut_plan.source_qty 未設定/不正", warnings };
    }

    // yield（良品率）未設定は1扱い
    const cpYieldRaw = cpPage.yield;
    const cpYield = (cpYieldRaw === undefined || cpYieldRaw === null || cpYieldRaw === 0) ? 1 : Number(cpYieldRaw);
    if (!Number.isFinite(cpYield) || cpYield <= 0) {
      return { error: "cut_plan.yield 不正", warnings };
    }

    const outs = Array.isArray(cpPage.outputs) ? cpPage.outputs : [];
    if (outs.length === 0) return { error: "cut_plan.outputs が空", warnings };

    // outputs総個数
    let outTotalQty = 0;
    for (const o of outs) {
      const q = Number(o.qty ?? 0);
      if (Number.isFinite(q) && q > 0) outTotalQty += q;
    }
    if (outTotalQty <= 0) return { error: "cut_plan.outputs の qty が全て0/不正", warnings };

    // 当該部品がoutputsに含まれるか（検証）
    let matchedOutQty = 0;
    for (const o of outs) {
      if (!o.part) continue;
      const op = dv.page(o.part);
      if (!op) continue;
      if (partPage?.file?.path && op.file?.path === partPage.file.path) {
        const q = Number(o.qty ?? 0);
        if (Number.isFinite(q) && q > 0) matchedOutQty += q;
      }
    }
    if (matchedOutQty === 0) {
      warnings.push("cut_plan.outputs に当該partが含まれていない（指定ミス疑い）");
    }

    // source_qty と材料 uom の整合チェック（単位取り違えの可能性を警告）
    const uomRaw = (matPage.uom != null && matPage.uom !== undefined) ? String(matPage.uom).trim().toLowerCase() : "";
    if (uomRaw) {
      const maxVal = UOM_SOURCE_QTY_MAX[uomRaw];
      if (maxVal !== undefined && sourceQty > maxVal) {
        warnings.push(`${uomRaw} の割に source_qty が大きい（${sourceQty}）。単位の取り違えの可能性`);
      }
      if (uomRaw === "pcs" && !Number.isInteger(sourceQty)) {
        warnings.push("uom が pcs のとき source_qty は整数が一般的");
      }
    }

    const planMatCostTotal = (Number(matUnitCost) * sourceQty) / cpYield;
    const unitMatCost = planMatCostTotal / outTotalQty;

    return {
      unitMatCost,
      warnings,
      usedAvgCost,
      matUnitCost,
      sourceQty,
      cpYield,
      outTotalQty,
      matchedOutQty,
      cpPage,
      matPage
    };
  }

  // ===== 集計（1回だけ）=====
  const rows = [];
  let totalQty = 0;
  let materialTotal = 0;
  let processTotal  = 0;
  let grandTotal    = 0;

  const incomplete = []; // 未設定・計算不能・警告

  // --- 加工費レート（未設定時は process_time_minutes から計算） ---
  const ratePage = dv.page("BOM/settings/加工費レート");
  const hourlyRate = (ratePage && Number.isFinite(Number(ratePage?.hourly_rate))) ? Number(ratePage.hourly_rate) : 0;

  for (const c of (prod.components ?? [])) {
    const partPage = dv.page(c.part);
    const partName = partPage?.file?.name ?? String(c.part);
    const qty = Number(c.qty ?? 0);

    if (!partPage || !Number.isFinite(qty) || qty <= 0) continue;

    // --- 加工費（未設定は0でOK；process_cost が無い/0なら process_time_minutes × 時給で計算） ---
    let process = Number(partPage?.[PROCESS_FIELD] ?? 0);
    if (!(process > 0)) {
      const ptMin = Number(partPage?.process_time_minutes ?? 0);
      if (Number.isFinite(ptMin) && ptMin > 0 && hourlyRate > 0) {
        process = Math.round(ptMin * (hourlyRate / 60));
      } else {
        process = 0;
      }
    }

    // --- 従来材料参照（fallback用） ---
    const matArgFallback = toMaterialPageArg(partPage?.material);
    const matPageFallback = matArgFallback ? dv.page(matArgFallback) : null;
    const costInfoFallback = effectiveMaterialUnitCost(matPageFallback);
    const purchaseUnitCostFallback = costInfoFallback ? costInfoFallback.unitCost : null;

    // --- 従来：材料1単位あたり製造個数（単一取りの近似） ---
    const unitsPerMaterial = partPage?.units_per_material ?? null;

    // --- 従来：歩留まり（0や未設定は「未設定扱い」にしたいので null扱い） ---
    const yieldRateRaw = partPage?.yield;
    const yieldRate = (yieldRateRaw === undefined || yieldRateRaw === null || yieldRateRaw === 0) ? null : Number(yieldRateRaw);

    // --- 計算結果 ---
    let matUnitRaw = null;          // 歩留まり抜き：部品1個あたり材料費
    let matUnitWithYield = null;    // 歩留まり込み：部品1個あたり材料費
    let matCost = 0;                // 集計用（計算不能なら0）

    // 参照表示用
    let usedCutPlan = false;
    let usedPlanLink = "";
    let usedMatLink = "";
    let usedMatUnitCost = null;
    let usedUom = "—";
    let usedUnitsPerMaterial = unitsPerMaterial ?? null;
    let usedYieldShown = yieldRate ?? "—";

    // ===== 1) cut_plan 指定があれば、個数配賦を優先 =====
    if (c.cut_plan) {
      const cpArg = toCutPlanPageArg(c.cut_plan);
      const cpPage = cpArg ? dv.page(cpArg) : null;

      if (!cpPage) {
        incomplete.push({ partName, partPage, reason: "component.cut_plan が解決できない" });
      } else {
        const res = computeUnitMatCostFromCutPlan(cpPage, partPage);

        if (res?.error) {
          incomplete.push({ partName, partPage, reason: `cut_plan不備: ${res.error}` });
        } else {
          usedCutPlan = true;
          usedPlanLink = res.cpPage?.file?.link ?? "";
          usedMatLink = res.matPage?.file?.link ?? "";
          usedMatUnitCost = res.matUnitCost ?? null;
          usedUom = (res.matPage?.uom != null && res.matPage?.uom !== "") ? String(res.matPage.uom) : "—";

          // 個数配賦のunitは既に cut_plan.yield 込み
          matUnitRaw = res.unitMatCost;
          matUnitWithYield = res.unitMatCost;
          matCost = res.unitMatCost * qty;

          // この場合、部品側yield/units_per_materialは使わない（表示もダッシュに寄せる）
          usedUnitsPerMaterial = "—";
          usedYieldShown = (res.cpYield !== 1) ? res.cpYield : "—";

          // warningsをincompleteへ
          for (const w of (res.warnings ?? [])) {
            incomplete.push({ partName, partPage, reason: `警告: ${w}` });
          }
        }
      }
    }

    // ===== 2) cut_plan なし → 従来計算（単一取り近似） =====
    if (!usedCutPlan) {
      // purchaseUnitCost / unitsPerMaterial が材料費（歩留まり抜き）
      if (purchaseUnitCostFallback !== null && unitsPerMaterial !== null && unitsPerMaterial !== 0) {
        matUnitRaw = Number(purchaseUnitCostFallback) / Number(unitsPerMaterial);

        // 歩留まり込み
        if (yieldRate !== null && Number.isFinite(yieldRate) && yieldRate > 0) {
          matUnitWithYield = matUnitRaw / yieldRate;
          matCost = matUnitWithYield * qty;
        } else {
          incomplete.push({ partName, partPage, reason: "yield 未設定/0" });
        }
      } else {
        if (purchaseUnitCostFallback === null) incomplete.push({ partName, partPage, reason: "incomplete: material 単価未設定（avg_unit_cost / purchase_unit_cost / purchases）" });
        if (unitsPerMaterial === null || unitsPerMaterial === 0) incomplete.push({ partName, partPage, reason: "units_per_material 未設定/0" });
      }

      usedMatLink = matPageFallback?.file?.link ?? (partPage?.material ?? "—");
      usedMatUnitCost = purchaseUnitCostFallback;
      usedUom = (matPageFallback?.uom != null && matPageFallback?.uom !== "") ? String(matPageFallback.uom) : "—";
    }

    const procCost = process * qty;
    const totalCost = matCost + procCost;

    totalQty += qty;
    materialTotal += matCost;
    processTotal  += procCost;
    grandTotal    += totalCost;

    rows.push({
      partName,
      partPage,
      qty,

      // 表示用
      usedCutPlan,
      usedPlanLink,
      usedMatLink,
      usedMatUnitCost,
      usedUom,
      usedUnitsPerMaterial,
      usedYieldShown,

      // 計算結果
      matUnitRaw,
      matUnit: matUnitWithYield, // 既存変数名に合わせる
      matCost,
      process,
      procCost,
      totalCost
    });
  }

  // ===== サマリー =====
  dv.paragraph("## 製品サマリー");
  dv.table(
    ["項目", "値"],
    [
      ["製品ID", dv.fileLink(prod.file.path, false, prod.product_no ?? prod.file.name)],
      ["製品", dv.fileLink(prod.file.path, false, prod.name ?? prod.file.name)],
      ["部品点数（行数）", rows.length],
      ["総数量（Qty合計）", totalQty],
      ["材料費合計（歩留まり込み）", Math.round(materialTotal)],
      ["加工費合計", Math.round(processTotal)],
      ["総原価（材料+加工）", Math.round(grandTotal)],
      ["加工費比率", grandTotal > 0 ? `${Math.round((processTotal / grandTotal) * 100)}%` : "-"],
    ]
  );

  if (incomplete.length > 0) {
    dv.paragraph("### 未設定・警告（材料費が計算できない／設定ミス疑い）");
    dv.table(
      ["Part", "理由"],
      incomplete.map(x => [x.partPage?.file?.link ?? x.partName, x.reason])
    );
    dv.paragraph("<br>");
  }

  // ===== Top3（合計ベース） + チャート =====
  const top3 = [...rows].sort((a, b) => b.totalCost - a.totalCost).slice(0, 3);
  const labels = top3.map(r => r.partName);
  const values = top3.map(r => Math.round(r.totalCost));

  // callout内に2つのchart codeblockを入れる（各行を > で始める）
  const callout = [
    `> [!bomcharts] 原価構成ダッシュボード(左：原価構成 / 右：部品別コスト Top3)`,
    `> `,
    `> \`\`\`chart`,
    `> type: pie`,
    `> labelColors: true`,
    `> plugins:`,
    `>   title:`,
    `>     display: true`,
    `>     text: "原価構成"`,
    `> labels: ["材料費","加工費"]`,
    `> series:`,
    `>   - data: [${Math.round(materialTotal)}, ${Math.round(processTotal)}]`,
    `> width: 100%`,
    `> \`\`\``,
    `> `,
    `> \`\`\`chart`,
    `> type: bar`,
    `> labels: [${labels.map(l => `"${l}"`).join(", ")}]`,
    `> series:`,
    `>   - title: "部品別コスト Top3（材料＋加工）"`,
    `>     data: [${values.join(", ")}]`,
    `> title: コスト寄与 Top3`,
    `> beginAtZero: true`,
    `> width: 100%`,
    `> \`\`\``,
  ].join("\n");

  dv.paragraph(callout);
  dv.paragraph("<br>");

  if (top3.length > 0) {
    dv.paragraph("### コスト寄与 Top3（材料+加工）");
    dv.table(
      ["Part", "Qty", "材料費", "加工費", "合計", "構成比"],
      top3.map(r => [
        r.partPage?.file?.link ?? r.partName,
        r.qty,
        Math.round(r.matCost),
        Math.round(r.procCost),
        Math.round(r.totalCost),
        grandTotal > 0 ? `${Math.round((r.totalCost / grandTotal) * 100)}%` : "-"
      ])
    );
  }

  // ---- 解像度改善：棒グラフcanvasを高DPI化してボケを抑える ----
  setTimeout(() => {
    try {
      const root = document.querySelector('.callout[data-callout="bomcharts"] .callout-content');
      if (!root) return;

      const canvases = root.querySelectorAll('.block-language-chart > canvas');
      if (!canvases || canvases.length < 2) return;

      const barCanvas = canvases[1]; // 2つ目が棒グラフ想定
      const dpr = window.devicePixelRatio || 1;

      // 表示サイズ（CSSピクセル）を取得
      const rect = barCanvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));

      // 内部解像度（実ピクセル）を引き上げ
      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round(cssH * dpr);

      // 既に十分なら何もしない（無限ループ防止）
      if (barCanvas.width === targetW && barCanvas.height === targetH) return;

      // CSSサイズを固定（見た目は変えない）
      barCanvas.style.width = `${cssW}px`;
      barCanvas.style.height = `${cssH}px`;

      // 内部解像度を上げる
      barCanvas.width = targetW;
      barCanvas.height = targetH;

      // 再描画を誘発（Charts側がresizeを監視している前提）
      window.dispatchEvent(new Event("resize"));
    } catch (e) {
      // 何もしない（帳票生成を壊さない）
    }
  }, 200);

  // ===== 明細表 =====
  dv.paragraph("### 明細表");
  dv.table(
    ["部品", "数量", "材料/参照", "材料単価（円/単位）", "単位", "取数（個/単位）", "歩留まり", "材料費（理論/個）", "材料費（歩留/個）", "材料費", "加工単価", "加工費", "合計原価", "cut_plan"],
    rows.map(r => [
      r.partPage?.file?.link ?? r.partName,
      r.qty,
      r.usedMatLink ?? "—",
      (r.usedMatUnitCost ?? "—"),
      (r.usedUom ?? "—"),
      (r.usedUnitsPerMaterial ?? "—"),
      (r.usedYieldShown ?? "—"),
      r.matUnitRaw !== null ? Math.round(r.matUnitRaw * 10) / 10 : "—",
      r.matUnit !== null ? Math.round(r.matUnit * 10) / 10 : "—",
      Math.round(r.matCost),
      r.process,
      Math.round(r.procCost),
      Math.round(r.totalCost),
      r.usedCutPlan ? (r.usedPlanLink || "—") : "—"
    ])
  );

  dv.paragraph("<br>");
  dv.paragraph(`**TOTAL（材料+加工）: ${Math.round(grandTotal)}**`);
}

main();

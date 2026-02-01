/**
 * QuickAdd: Edit BOM List Items
 *
 * Supports:
 * - type: product   -> frontmatter.components ( [{part, qty, cut_plan?}] )
 * - type: cut_plan  -> frontmatter.outputs    ( [{part, qty}] )
 *
 * product components item can optionally include:
 *   cut_plan: "[[CP-0001_...]]"
 */

module.exports = async (params) => {
  const { app, quickAddApi } = params;

  // ---- Settings ----
  const PARTS_FOLDER = "BOM/parts";
  const CUT_PLANS_FOLDER = "BOM/cut_plans";
  const TYPE_FIELD = "type";

  // type -> edited frontmatter field & UI labels
  const TYPE_CONFIG = {
    product: {
      frontField: "components",
      listLabel: "components",
      modeLabels: ["既存componentsから編集", "parts一覧から追加"],
      updatedNoticePrefix: "components 更新",
      supportsCutPlan: true,
    },
    cut_plan: {
      frontField: "outputs",
      listLabel: "outputs",
      modeLabels: ["既存outputsから編集", "parts一覧から追加"],
      updatedNoticePrefix: "outputs 更新",
      supportsCutPlan: false,
    },
  };

  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("アクティブなノートがありません。対象ノートを開いて実行してください。");
    return;
  }

  // ===== Determine type and target field =====
  const fileCache = app.metadataCache.getFileCache(activeFile);
  const fm = fileCache?.frontmatter ?? {};
  const typeVal = String(fm?.[TYPE_FIELD] ?? "").trim().toLowerCase();

  const cfg = TYPE_CONFIG[typeVal];
  if (!cfg) {
    new Notice(
      `このノートでは実行できません。frontmatter に「${TYPE_FIELD}: product」または「${TYPE_FIELD}: cut_plan」を設定してください。`
    );
    return;
  }

  const FRONT_FIELD = cfg.frontField;

  // ---- helpers ----
  const toLinkString = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (s.startsWith("[[") && s.endsWith("]]")) return s;
    return `[[${s}]]`;
  };

  const basenameFromLink = (link) => {
    const s = String(link ?? "");
    return s.replace(/^\[\[/, "").replace(/\]\]$/, "");
  };

  const normalizeLinkish = (v) => {
    // accepts [[...]] or pathish; returns without brackets and without .md
    let s = String(v ?? "").trim();
    s = s.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    s = s.replace(/^\[\[/, "").replace(/\]\]$/, "");
    s = s.replace(/\.md$/i, "");
    return s;
  };

  const listBasenamesInFolder = (folderPath) => {
    return app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folderPath + "/"))
      .map((f) => f.basename)
      .sort((a, b) => a.localeCompare(b, "ja"));
  };

  const readFrontmatterItems = () => {
    const cache = app.metadataCache.getFileCache(activeFile);
    const fm2 = cache?.frontmatter;
    const raw = fm2?.[FRONT_FIELD];

    if (!Array.isArray(raw)) return [];

    return raw
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        part: toLinkString(x.part),
        qty: Number(x.qty ?? 0),
        cut_plan: cfg.supportsCutPlan ? toLinkString(x.cut_plan) : "", // product only
      }))
      .filter((x) => x.part && Number.isFinite(x.qty));
  };

  // ---- Mode selection ----
  const mode = await quickAddApi.suggester(cfg.modeLabels, cfg.modeLabels);
  if (!mode) return;

  let pickedBasename = "";
  let currentQty = "";
  let currentCutPlan = ""; // only meaningful when product

  if (mode === cfg.modeLabels[0]) {
    const items = readFrontmatterItems();

    if (items.length === 0) {
      new Notice(`${cfg.listLabel} が空です。parts一覧から追加してください。`);
      return;
    }

    const displays = items.map((c) => {
      const p = basenameFromLink(c.part);
      const q = c.qty;
      const cp = cfg.supportsCutPlan && c.cut_plan ? ` / cut_plan=${basenameFromLink(c.cut_plan)}` : "";
      return `${p}  (qty=${q}${cp})`;
    });

    const pickedDisplay = await quickAddApi.suggester(displays, displays);
    if (!pickedDisplay) return;

    const idx = displays.indexOf(pickedDisplay);
    const chosen = items[idx];

    pickedBasename = basenameFromLink(chosen.part);
    currentQty = String(chosen.qty);
    if (cfg.supportsCutPlan) currentCutPlan = chosen.cut_plan || "";
  } else if (mode === cfg.modeLabels[1]) {
    const parts = listBasenamesInFolder(PARTS_FOLDER);
    if (parts.length === 0) {
      new Notice(`parts が見つかりません: ${PARTS_FOLDER}`);
      return;
    }

    const picked = await quickAddApi.suggester(parts, parts);
    if (!picked) return;

    pickedBasename = picked;

    const items = readFrontmatterItems();
    const existing = items.find((c) => basenameFromLink(c.part) === pickedBasename);
    if (existing) {
      currentQty = String(existing.qty);
      if (cfg.supportsCutPlan) currentCutPlan = existing.cut_plan || "";
    }
  }

  const partLink = `[[${pickedBasename}]]`;

  // ---- Qty prompt (0=delete) ----
  const qtyStr = await quickAddApi.inputPrompt(
    "数量（qty）を入力（0で削除）",
    "例: 2 / 削除は 0",
    currentQty || "1"
  );
  if (qtyStr === null) return;

  const qty = Number(qtyStr);
  if (!Number.isFinite(qty) || qty < 0) {
    new Notice("数量は 0以上の数値で入力してください。（0 = 削除）");
    return;
  }

  // ---- (product only) Ask & select cut_plan after qty ----
  let selectedCutPlanLink = "";
  if (cfg.supportsCutPlan && qty > 0) {
    const options = [
      "cut_plan を指定しない",
      "cut_plan を指定する",
    ];
    // 既に指定がある場合は「指定する」を先に見せたいなら並び替えも可
    const pickedOpt = await quickAddApi.suggester(options, options);
    if (!pickedOpt) return;

    if (pickedOpt === "cut_plan を指定する") {
      const plans = listBasenamesInFolder(CUT_PLANS_FOLDER);
      if (plans.length === 0) {
        new Notice(`cut_plan が見つかりません: ${CUT_PLANS_FOLDER}`);
        return;
      }

      // 既存指定があるならそれを見つけてプリセット的に示す（候補の先頭に出す）
      let planChoices = plans.slice();
      const existingBase = normalizeLinkish(currentCutPlan).split("/").pop();
      if (existingBase && planChoices.includes(existingBase)) {
        planChoices = [existingBase, ...planChoices.filter((x) => x !== existingBase)];
      }

      const pickedPlan = await quickAddApi.suggester(planChoices, planChoices);
      if (!pickedPlan) return;

      selectedCutPlanLink = `[[${pickedPlan}]]`;
    } else {
      selectedCutPlanLink = ""; // 明示的に削除
    }
  }

  let action = "";

  // ---- Update frontmatter ----
  await app.fileManager.processFrontMatter(activeFile, (fm3) => {
    let items = fm3[FRONT_FIELD];
    if (!Array.isArray(items)) items = [];

    items = items
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const base = {
          part: toLinkString(x.part),
          qty: Number(x.qty ?? 0),
        };
        if (cfg.supportsCutPlan) {
          base.cut_plan = toLinkString(x.cut_plan);
        }
        return base;
      })
      .filter((x) => x.part && Number.isFinite(x.qty));

    const idx = items.findIndex((x) => x.part === partLink);

    if (qty === 0) {
      if (idx >= 0) {
        items.splice(idx, 1);
        action = "削除";
      } else {
        action = "未登録（削除対象なし）";
      }
    } else {
      const newItem = { part: partLink, qty };

      // product only: add/remove cut_plan
      if (cfg.supportsCutPlan) {
        if (selectedCutPlanLink) newItem.cut_plan = selectedCutPlanLink;
        // 指定しない選択なら cut_plan を持たせない（既存があっても消える）
      }

      if (idx >= 0) {
        // REPLACE
        items[idx].qty = qty;
        if (cfg.supportsCutPlan) {
          if (selectedCutPlanLink) {
            items[idx].cut_plan = selectedCutPlanLink;
          } else {
            // 明示的に未指定（削除）
            delete items[idx].cut_plan;
          }
        }
        action = "置換";
      } else {
        // ADD
        items.push(newItem);
        action = "追加";
      }
    }

    items.sort((a, b) => a.part.localeCompare(b.part, "ja"));
    fm3[FRONT_FIELD] = items;
  });

  const cpInfo =
    cfg.supportsCutPlan && qty > 0
      ? (selectedCutPlanLink ? ` / cut_plan=${basenameFromLink(selectedCutPlanLink)}` : " / cut_plan=なし")
      : "";

  new Notice(`${cfg.updatedNoticePrefix}: ${pickedBasename} → ${action} (qty=${qty}${cpInfo})`);
};

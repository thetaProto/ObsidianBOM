module.exports = async (params) => {
  const { app } = params;

  // ========= Common helpers =========
  const getActiveFileOrNotice = () => {
    const file = app.workspace.getActiveFile();
    if (!file) {
      new Notice("アクティブファイルがありません");
      return null;
    }
    return file;
  };

  const getFrontmatter = (file) => {
    const cache = app.metadataCache.getFileCache(file);
    return cache?.frontmatter ?? {};
  };

  const normalizeLinkish = (val) => {
    if (val == null) return "";
    let s = Array.isArray(val) ? String(val[0]) : String(val);
    s = s.trim();
    s = s.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    s = s.replace(/^\[\[/, "").replace(/\]\]$/, ""); // [[...]] -> ...
    s = s.replace(/\.md$/i, "");
    return s;
  };

  const sanitizeFileName = (name) => String(name ?? "").replace(/[\\\/:*?"<>|]/g, "_");

  const renameIfPossible = async (file, newBase) => {
    const newPath = `${file.parent.path}/${newBase}.md`;

    if (file.basename === newBase) {
      new Notice("すでに最新のファイル名です");
      return;
    }
    if (app.vault.getAbstractFileByPath(newPath)) {
      new Notice(`同名ファイルが既に存在します: ${newBase}`);
      return;
    }
    await app.fileManager.renameFile(file, newPath);
    new Notice(`Renamed: ${newBase}`);
  };

  const resolveFileByPathsOrBasename = (tryPaths, basename) => {
    // 1) パスで直接解決
    for (const p of tryPaths) {
      const af = app.vault.getAbstractFileByPath(p);
      if (af && af.path) return af;
    }
    // 2) basename検索（Vault全体）
    const candidates = app.vault.getFiles().filter((f) => f.basename === basename);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      new Notice(`候補が複数あります: ${candidates.map((c) => c.path).join(" / ")}`);
      return null;
    }
    return null;
  };

  // ========= Type-based dispatch =========
  const renameByType = {
    // ---- drawing: 既存ロジックを関数化（ほぼそのまま） ----
    drawing: async (file, fm) => {
      const title = file.basename;
      const drawingNo =
        (fm.drawing_no ?? "").toString().trim() ||
        (title.match(/^DW-\d{4}/)?.[0] ?? "");

      if (!drawingNo) {
        new Notice("drawing_no が見つかりません（frontmatter またはタイトル DW-0001 形式が必要）");
        return;
      }

      const rev = ((fm.rev ?? "A").toString().trim() || "A");

      // part
      let partVal = fm.part;
      if (!partVal) {
        new Notice("part が未入力です");
        return;
      }
      const partStr = normalizeLinkish(partVal);

      const PARTS_DIR = "BOM/parts/";
      const base = partStr.split("/").pop(); // "P-0001_側板"

      const tryPaths = [
        `${PARTS_DIR}${base}.md`,
        `${partStr}.md`,
        `${base}.md`,
      ];

      const partFile = resolveFileByPathsOrBasename(tryPaths, base);
      if (!partFile) {
        new Notice(`part ノートが見つかりません: ${partStr}`);
        return;
      }

      const partFm = getFrontmatter(partFile);
      const partNo = (partFm.part_no ?? "").toString().trim();
      const partName = (partFm.name ?? "").toString().trim();

      if (!partNo || !partName) {
        new Notice(`part ノートに part_no / name がありません: ${partFile.path}`);
        return;
      }

      const safeName = sanitizeFileName(partName);
      const newBase = `${drawingNo}_${partNo}_${safeName}_rev${rev}`;

      await renameIfPossible(file, newBase);
    },

    // ---- ここから先は拡張用の“枠”（あなたの命名規則に合わせて実装） ----

    // 例: part ノートを "P-0001_側板" のように統一する
    part: async (file, fm) => {
      const partNo = (fm.part_no ?? "").toString().trim();
      const name = sanitizeFileName((fm.name ?? "").toString().trim());

      if (!partNo || !name) {
        new Notice("part_no / name が不足しています");
        return;
      }

      const newBase = `${partNo}_${name}`;
      await renameIfPossible(file, newBase);
    },

    // 例: material ノートを "M-0000_シナ合板_2.5mm" のように統一する
    material: async (file, fm) => {
      const materialNo = (fm.material_no ?? "").toString().trim();
      const name = sanitizeFileName((fm.name ?? "").toString().trim());
      const spec = sanitizeFileName((fm.spec ?? "").toString().trim()); // 厚み等を spec に入れる前提

      if (!materialNo || !name) {
        new Notice("material_no / name が不足しています");
        return;
      }

      const newBase = spec ? `${materialNo}_${name}_${spec}` : `${materialNo}_${name}`;
      await renameIfPossible(file, newBase);
    },

    // 例: product ノートを "PR-001_テスト箱" のように統一する
    product: async (file, fm) => {
      const productNo = (fm.product_no ?? fm.assembly_no ?? "").toString().trim();
      const name = sanitizeFileName((fm.name ?? "").toString().trim());

      if (!productNo || !name) {
        new Notice("product_no(またはassembly_no) / name が不足しています");
        return;
      }

      const newBase = `${productNo}_${name}`;
      await renameIfPossible(file, newBase);
    },

    // ---- bom_view: "BOM_<product>" にリネーム ----
    bom_view: async (file, fm) => {
      let productVal = fm.product;
      if (!productVal) {
        new Notice("bom_view には product プロパティが必要です");
        return;
      }

      const productStr = normalizeLinkish(productVal); // [[PR-001_テスト箱]] → PR-001_テスト箱

      const PRODUCTS_DIR = "BOM/products/";
      const base = productStr.split("/").pop(); // PR-001_テスト箱 など

      const tryPaths = [
        `${PRODUCTS_DIR}${base}.md`,
        `${productStr}.md`,
        `${base}.md`,
      ];

      const productFile = resolveFileByPathsOrBasename(tryPaths, base);
      if (!productFile) {
        new Notice(`product ノートが見つかりません: ${productStr}`);
        return;
      }

      const prodFm = getFrontmatter(productFile);
      const productNo = (prodFm.product_no ?? prodFm.assembly_no ?? "").toString().trim();
      const productName = (prodFm.name ?? "").toString().trim();

      if (!productNo || !productName) {
        new Notice(`product ノートに product_no / name がありません: ${productFile.path}`);
        return;
      }

      const safeName = sanitizeFileName(productName);
      const newBase = `BOM_${productNo}_${safeName}`;

      await renameIfPossible(file, newBase);
    },
    // ---- purchase: "PO-YYYY-MM-DD_<material>" にリネーム ----
    purchase: async (file, fm) => {
      // date
      const rawDate = (fm.purchased_on ?? fm.date ?? "").toString().trim();
      if (!rawDate) {
        new Notice("purchase には purchased_on（または date）が必要です");
        return;
      }

      // 形式ゆれ対策：先頭10文字を YYYY-MM-DD として扱う（2026-01-25T... も許容）
      const ymd = rawDate.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        new Notice(`日付形式が不正です（YYYY-MM-DD）: ${rawDate}`);
        return;
      }

      // material
      const materialVal = fm.material;
      if (!materialVal) {
        new Notice("purchase には material が必要です");
        return;
      }

      const materialStr = normalizeLinkish(materialVal); // [[M-0000_...]] -> M-0000_...
      const materialBase = materialStr.split("/").pop(); // パスが来ても basename に寄せる
      const safeMaterial = sanitizeFileName(materialBase);

      const newBase = `PO-${ymd}_${safeMaterial}`;
      await renameIfPossible(file, newBase);
    },
  };

  // ========= Main =========
  const file = getActiveFileOrNotice();
  if (!file) return;

  const fm = getFrontmatter(file);

  // type は frontmatter のキーとして "type" を前提
  const type = (fm.type ?? "").toString().trim().toLowerCase();
  if (!type) {
    new Notice("frontmatter の type が未設定です（例: type: drawing）");
    return;
  }

  const handler = renameByType[type];
  if (!handler) {
    new Notice(`未対応の type です: ${type}`);
    return;
  }

  await handler(file, fm);
};

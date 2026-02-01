/**
 * QuickAdd: Create BOM View note from template and bind product link
 * Preconditions:
 * - Active note must be product note with frontmatter: type: product
 * - Template file exists (TEMPLATE_PATH)
 *
 * Output:
 * - Creates a new note under VIEW_FOLDER
 * - Inserts template content
 * - Replaces frontmatter product: "" with product: [[<active file basename>]]
 * - Opens the created note
 */

module.exports = async (params) => {
    const { app, quickAddApi } = params;
  
    // ===== Settings =====
    const TEMPLATE_PATH = "templates/bom_view_template.md";   // <- your template file
    const VIEW_FOLDER   = "BOM/views";              // <- where to create view notes
    const TYPE_FIELD    = "type";
    const REQUIRED_TYPE = "product";
  
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("アクティブなノートがありません。製品ノートを開いて実行してください。");
      return;
    }
  
    // ---- Safety: require type: product ----
    const cache = app.metadataCache.getFileCache(activeFile);
    const fm = cache?.frontmatter;
    const typeVal = String(fm?.[TYPE_FIELD] ?? "").trim().toLowerCase();
    if (typeVal !== REQUIRED_TYPE) {
      new Notice(`このノートでは実行できません。frontmatter に「${TYPE_FIELD}: ${REQUIRED_TYPE}」が必要です。`);
      return;
    }
  
    // ---- Load template ----
    const templateFile = app.vault.getAbstractFileByPath(TEMPLATE_PATH);
    if (!templateFile) {
      new Notice(`テンプレートが見つかりません: ${TEMPLATE_PATH}`);
      return;
    }
    const templateText = await app.vault.read(templateFile);
  
    // ---- Ensure view folder exists ----
    const folder = app.vault.getAbstractFileByPath(VIEW_FOLDER);
    if (!folder) {
      await app.vault.createFolder(VIEW_FOLDER);
    }
  
    // ---- Determine product link & default view filename ----
    const productBasename = activeFile.basename; // e.g., "PR-001_テスト箱"
    const productLink = `"[[${productBasename}]]"`;
  
    // You can change naming convention freely:
    const defaultName = `BOM_${productBasename}`;
  
    // ---- Ask filename (optional but useful) ----
    const viewName = await quickAddApi.inputPrompt(
      "BOMビューのファイル名",
      "例: BOM_PR-001_テスト箱",
      defaultName
    );
    if (!viewName) return;
  
    const newPath = `${VIEW_FOLDER}/${viewName}.md`;
  
    // ---- Prevent overwrite ----
    const existing = app.vault.getAbstractFileByPath(newPath);
    if (existing) {
      new Notice(`同名ファイルが既に存在します: ${newPath}`);
      return;
    }
  
    // ---- Inject product into frontmatter ----
    // Replace ONLY the first occurrence of `product: ""` or `product: ''`
    let outText = templateText;
  
    const replaced =
      outText.match(/^\s*product:\s*["']{0,1}["']{0,1}\s*$/m) ||
      outText.match(/^\s*product:\s*""\s*$/m) ||
      outText.match(/^\s*product:\s*''\s*$/m);
  
    if (!replaced) {
      new Notice("テンプレートの frontmatter に product: \"\" が見つかりません。テンプレ側を確認してください。");
      return;
    }
  
    // frontmatter の product 行を、必ず link 形式にする
    outText = outText.replace(
      /^\s*product:\s*.*$/m,
      `product: ${productLink}`
    );
  
    // ---- Create file ----
    const created = await app.vault.create(newPath, outText);
  
    // ---- Open created note ----
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(created);
  
    new Notice(`BOMビューを作成しました: ${newPath}`);
  };
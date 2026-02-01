/**
 * QuickAdd: Apply process_cost to current part note
 *
 * Reads:
 * - BOM/settings/加工費レート.md frontmatter.hourly_rate (円/時)
 * - Current file (part) frontmatter.process_time_minutes (分)
 *
 * Computes: process_cost = round(process_time_minutes * (hourly_rate / 60))
 * Writes: current file frontmatter.process_cost
 *
 * Run from a part note (type: part). QuickAdd: Run script -> quickadd_apply_process_cost
 */

module.exports = async (params) => {
  const { app } = params;

  const RATE_NOTE_PATH = "BOM/settings/加工費レート.md";
  const TYPE_FIELD = "type";

  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("アクティブなノートがありません。部品ノートを開いて実行してください。");
    return;
  }

  const fileCache = app.metadataCache.getFileCache(activeFile);
  const fm = fileCache?.frontmatter ?? {};
  const typeVal = String(fm?.[TYPE_FIELD] ?? "").trim().toLowerCase();

  if (typeVal !== "part") {
    new Notice("このノートでは実行できません。frontmatter に type: part の部品ノートで実行してください。");
    return;
  }

  const rateFile = app.vault.getAbstractFileByPath(RATE_NOTE_PATH);
  if (!rateFile || !rateFile.path) {
    new Notice(`加工費レートノートが見つかりません: ${RATE_NOTE_PATH}`);
    return;
  }

  const rateCache = app.metadataCache.getFileCache(rateFile);
  const rateFm = rateCache?.frontmatter ?? {};
  const hourlyRate = Number(rateFm?.hourly_rate);
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    new Notice("加工費レートノートの hourly_rate が未設定または 0 以下です。");
    return;
  }

  const processTimeMinutes = Number(fm?.process_time_minutes);
  if (!Number.isFinite(processTimeMinutes) || processTimeMinutes <= 0) {
    new Notice("部品の process_time_minutes を設定してください。（例: 4分10秒 → 4.167）");
    return;
  }

  const processCost = Math.round(processTimeMinutes * (hourlyRate / 60));

  await app.fileManager.processFrontMatter(activeFile, (fm2) => {
    fm2.process_cost = processCost;
  });

  new Notice(`process_cost を ${processCost} 円で更新しました。`);
};

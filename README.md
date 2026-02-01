# Obsidian BOM Manager
Lightweight BOM / Cost Management System for Indie Creators & Small Makers

Obsidian 上で動作する、個人クリエイター・小規模メーカー向けの  
**軽量BOM（部品表）＋原価管理システム** です。

ExcelやNotionでは破綻しがちな「部品・材料・工程・原価」の管理を、  
Markdown + リンク構造 + Dataview によって **シンプルかつ堅牢に管理** できます。

---

## 🎯 これは何？

- BOM（部品表）
- 原価計算
- 材料管理
- 工程コスト管理
- 製品別利益計算
- 図面/設計ファイル管理

これらを **すべて Obsidian のノートだけで完結** させる仕組みです。

いわば、

> 「個人クリエイター版 PLM（Product Lifecycle Management）」

です。

SaaSやExcelに依存せず、  
**ローカル・テキストベース・Git管理可能** な設計になっています。

---

## ✨ 特徴

### ✅ テキスト＝データベース
- Markdownのみ
- 壊れにくい
- 長期保存可能
- Git管理OK
- 将来の移行も容易

### ✅ リンクベースBOM構造
```
Product → Parts → Materials → Process
```

部品・材料・工程が正規化され、再利用可能。

### ✅ 自動化
- ID自動連番
- 原価自動集計
- 工程コスト計算
- Dataviewダッシュボード
- テンプレート生成

### ✅ 完全カスタマイズ可能
JavaScript / DataviewJS により自由に拡張できます。

---

## 🧠 想定ユーザー

このツールは **万人向けではありません**。

以下のような方に強くハマります：

- レーザーカッター / 3Dプリンタ / CNC を使う作家
- デジタルファブ / ハードウェア系メーカー
- ハンドメイドD2Cブランド運営者
- SKUが増えてExcel管理が限界の人
- Obsidianを日常的に使っている人
- ノーコードSaaSより自作・ローカル志向の人

逆に、
- スマホ中心運用
- ITが苦手
- 直感的GUIのみ使いたい

このような場合は Notion / Airtable の方が適しています。

---

## 📦 管理できるもの

- 製品 (Products)
- 部品 (Parts)
- 材料 (Materials)
- 工程 (Processes)
- 図面 (Drawings)
- 原価 / 利益率 / 歩留まり

---

## 🔧 必要環境

- Obsidian
- Dataview
- Templater
- （推奨）Metadata Menu / QuickAdd

---

## 🚀 セットアップ

1. このリポジトリを clone
2. フォルダを Obsidian Vault として開く
3. 必要プラグインを有効化
4. テンプレートから新規作成するだけ

詳細は `/docs/setup.md` を参照。

---

## 💡 なぜ作った？

個人クリエイターにとって

- Excelは壊れやすい
- Notionは重い
- SaaSは高い
- 専用PLMはオーバースペック

という問題があります。

そこで、

> 「テキストだけで動く、軽量で永続的なBOM管理」

を目指してこの仕組みを作りました。

---

## 📊 できることの例

- 製品ごとの原価自動算出
- 材料単価変更 → 全製品へ自動反映
- 利益率ランキング
- 歩留まり管理
- 図面リンク管理
- Gitで履歴追跡

---

## ⚠️ 注意

- エンジニア/パワーユーザー向けです
- YAML/Dataviewの基本理解があるとスムーズです
- GUI中心の操作を期待しないでください

---

## 📄 License

MIT

---

## 🤝 Contributing

改善提案・Issue・PR歓迎です。
「個人メーカーのための最強ローカルBOM」を一緒に育てましょう。

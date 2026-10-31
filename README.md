# 英会話フレーズクイズ

単元を選ぶと10問出題され、日本語を見てすぐに英語にする練習ができるクイズです。

- 公開ページ: https://eigo-phrase-100.netlify.app/
- 🎤ボタンで音声入力（Chrome / Edge / Safari）、答え合わせ後に英文を読み上げ
- マイ単元: 自分で入力した例文をブラウザ内に保存して練習（ファイルで書き出し・読み込み可）

## 構成

```
index.html                 画面
app.js                     クイズ・単元選択・マイ単元の処理
data/youtube/100sen-1.js   YouTubeフレーズ 100選①
data/shunkan/shunkan-XX.js  瞬間英作文1〜13（オリジナル例文・文法ミックス）
```

単元を増やすときは `data/` にファイルを追加し、`index.html` 末尾に `<script src="...">` を1行足します。

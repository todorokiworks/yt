# yt

指定した YouTube の英語字幕をフレーズにまとめ、日本語訳と一緒に見ながら再生する。

## ローカル

```sh
npm install
npm run dev
```

一覧から動画を開く。フレーズを選ぶと、その時刻から再生する。

取り込み済みのデータは `src/data/videos/` にある。

## 動画を追加する

ローカルでは次を実行する。`yt-dlp` が必要。

```sh
npm run import -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

同じ動画を取り直すときは `--rebuild` を付ける。

GitHub では Actions の Import video を手動実行し、YouTube の URL を渡す。完了した push を Netlify が公開する。

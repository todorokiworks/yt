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

手元で SRT と視聴用 JSON を書き出す。

```sh
npm run import -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

同じ動画を取り直すときは `--rebuild` を付ける。できた `src/data/videos/` のファイルを GitHub の `main` へ push すると、Netlify が公開する。

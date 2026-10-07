import { defineConfig } from "astro/config";
import { fetchCaptions } from "./src/lib/fetch-captions.mjs";

export default defineConfig({
  output: "static",
  vite: {
    plugins: [
      {
        name: "captions-dev",
        configureServer(server) {
          server.middlewares.use("/api/captions", (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.end("Method not allowed");
              return;
            }
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", async () => {
              try {
                const { url } = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
                const data = await fetchCaptions(url);
                res.setHeader("content-type", "application/json; charset=utf-8");
                res.end(JSON.stringify(data));
              } catch (error) {
                const message = error instanceof Error ? error.message : "字幕を取得できませんでした";
                res.statusCode = 400;
                res.setHeader("content-type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: message }));
              }
            });
          });
        },
      },
    ],
  },
});

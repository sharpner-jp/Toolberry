// ============================================================
// 🍓 Toolberry Server - Full Enhanced Version
// ============================================================

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const QRCode = require("qrcode");

const app = express();
app.use(express.static("public"));

// ============================================================
// 🌐 HTML Downloader (GET)
// ============================================================
app.get("/download", async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).send("URLを入力してください。");
  }

  // ✅ 自動で https:// を補完
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  try {
    const safeFileName = url.replace(/[^a-z0-9]/gi, "_") + ".html";
    const filePath = path.join(__dirname, safeFileName);

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000, // 15秒のタイムアウト
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // リダイレクトも許可
      }
    });

    fs.writeFileSync(filePath, response.data.toString("utf8"), "utf8");

    res.download(filePath, safeFileName, (err) => {
      if (err) {
        console.error("[DOWNLOAD ERROR]", err.message);
      }
      // ファイルを削除
      setTimeout(() => {
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) {
            console.error("[FILE DELETE ERROR]", unlinkErr.message);
          }
        });
      }, 1000);
    });

  } catch (err) {
    console.error("[HTML ERROR]", err.message);

    // エラーの種類に応じてメッセージを返す
    if (err.code === 'ENOTFOUND') {
      return res.status(404).send("URLが見つかりません。正しいURLを入力してください。");
    } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(408).send("接続がタイムアウトしました。もう一度お試しください。");
    } else if (err.code === 'ECONNREFUSED') {
      return res.status(503).send("サーバーに接続できませんでした。URLを確認してください。");
    } else if (err.response && err.response.status === 404) {
      return res.status(404).send("ページが見つかりません。URLを確認してください。");
    } else if (err.response && err.response.status === 403) {
      return res.status(403).send("アクセスが拒否されました。このページはダウンロードできません。");
    }

    return res.status(500).send("HTMLの取得に失敗しました。URLを確認してください。");
  }
});

// ============================================================
// 🐱 Scratch SB3 Downloader (GET)
// ============================================================
app.get("/scratch-download/:projectId", async (req, res) => {
  let input = req.params.projectId;

  // ✅ URLだった場合はID部分を抽出
  const match = input.match(/projects\/(\d+)/);
  const projectId = match ? match[1] : input.replace(/\D/g, "");

  if (!projectId) {
    return res.status(400).send("プロジェクトIDまたはURLを入力してください。");
  }

  const metaUrl = `https://api.scratch.mit.edu/projects/${projectId}`;
  const tempDir = path.join(__dirname, "temp", projectId);
  const jsonPath = path.join(tempDir, "project.json");
  const sb3Path = path.join(tempDir, "project.sb3");

  try {
    // tempディレクトリを作成
    await fs.promises.mkdir(tempDir, { recursive: true });

    // プロジェクトのメタデータを取得
    const metaRes = await axios.get(metaUrl, { timeout: 10000 });
    const meta = metaRes.data;
    const token = meta.project_token;

    if (!token) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      return res.status(400).send("このプロジェクトは公開されていません。");
    }

    // プロジェクトデータを取得
    const projectUrl = `https://projects.scratch.mit.edu/${projectId}?token=${token}`;
    const projectRes = await axios.get(projectUrl, { timeout: 15000 });

    // project.jsonを保存
    await fs.promises.writeFile(jsonPath, JSON.stringify(projectRes.data, null, 2));

    // .sb3ファイルを作成（zipアーカイブ）
    const output = fs.createWriteStream(sb3Path);
    const archive = archiver("zip", {
      zlib: { level: 9 } // 最大圧縮
    });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.file(jsonPath, { name: "project.json" });
    await archive.finalize();

    output.on("close", async () => {
      res.download(sb3Path, `scratch-project-${projectId}.sb3`, async (err) => {
        if (err) {
          console.error("[SB3 DOWNLOAD ERROR]", err.message);
        }
        // 一時ファイルを削除
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      });
    });

  } catch (err) {
    console.error("[Scratch Error]", err.message);

    // 一時ファイルのクリーンアップ
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error("[Cleanup Error]", cleanupErr.message);
    }

    if (err.response && err.response.status === 404) {
      return res.status(404).send("プロジェクトが見つかりません。IDを確認してください。");
    }

    return res.status(500).send("Scratchプロジェクトの取得に失敗しました。");
  }
});

// ============================================================
// 📱 QRコードメーカー (GET)
// ============================================================
app.get("/qrcode", async (req, res) => {
  let { text } = req.query;

  if (!text) {
    return res.status(400).send("テキストまたはURLを入力してください。");
  }

  // ✅ https:// 自動補完（ただしリンクらしい時のみ）
  if (/^[\w.-]+\.[a-z]{2,}/i.test(text) && !/^https?:\/\//i.test(text)) {
    text = "https://" + text;
  }

  try {
    const tempDir = path.join(__dirname, "temp");
    await fs.promises.mkdir(tempDir, { recursive: true });

    const timestamp = Date.now();
    const filePath = path.join(tempDir, `qr_${timestamp}.png`);

    await QRCode.toFile(filePath, text, {
      width: 500,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff"
      },
      errorCorrectionLevel: "M"
    });

    res.download(filePath, "qrcode.png", (err) => {
      if (err) {
        console.error("[QR DOWNLOAD ERROR]", err.message);
      }
      // ファイルを削除
      setTimeout(() => {
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) {
            console.error("[QR FILE DELETE ERROR]", unlinkErr.message);
          }
        });
      }, 2000);
    });

  } catch (err) {
    console.error("[QR ERROR]", err.message);
    return res.status(500).send("QRコードの生成に失敗しました。");
  }
});

// ============================================================
// 🚀 サーバー起動
// ============================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Toolberry Server is running!`);
  console.log(`🍓 Access at: http://localhost:${PORT}`);
  console.log(`📂 Serving files from: ${path.join(__dirname, "public")}`);
});

// ============================================================
// 🧹 起動時のクリーンアップ（残った一時ファイルを削除）
// ============================================================
const cleanupTempFiles = () => {
  const tempDir = path.join(__dirname, "temp");
  if (fs.existsSync(tempDir)) {
    fs.rm(tempDir, { recursive: true, force: true }, (err) => {
      if (err) {
        console.error("[Cleanup Error]", err.message);
      } else {
        console.log("🧹 Temporary files cleaned up");
      }
    });
  }
};

// サーバー起動時にクリーンアップ
cleanupTempFiles();

// プロセス終了時にもクリーンアップ
process.on("exit", cleanupTempFiles);
process.on("SIGINT", () => {
  cleanupTempFiles();
  process.exit();
});

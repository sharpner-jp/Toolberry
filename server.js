// ============================================================
// 🚀 ToolsGo Server - Full Enhanced Version (URL auto-format + unified UI)
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
// server.jsの /download エンドポイントを修正
app.get("/download", async (req, res) => {
  let { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URLを入力してください。" });
  }

  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  try {
    const safeFileName = url.replace(/[^a-z0-9]/gi, "_") + ".html";
    const filePath = path.join(__dirname, safeFileName);

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      }
    });

    fs.writeFileSync(filePath, response.data.toString("utf8"), "utf8");

    res.download(filePath, safeFileName, (err) => {
      if (err) {
        console.error("[DOWNLOAD ERROR]", err.message);
      }
      setTimeout(() => fs.unlink(filePath, () => {}), 1000);
    });
  } catch (err) {
    console.error("[HTML ERROR]", err.message);

    // エラーをJSONで返す（テキストではなく）
    if (err.code === 'ENOTFOUND') {
      return res.status(404).json({ error: "URLが見つかりません。正しいURLを入力してください。" });
    } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(408).json({ error: "接続がタイムアウトしました。もう一度お試しください。" });
    }
    return res.status(500).json({ error: "HTMLの取得に失敗しました。URLを確認してください。" });
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

  if (!projectId) return res.send("プロジェクトIDまたはURLを入力してください。");

  const metaUrl = `https://api.scratch.mit.edu/projects/${projectId}`;
  const tempDir = path.join(__dirname, "temp", projectId);
  const jsonPath = path.join(tempDir, "project.json");
  const sb3Path = path.join(tempDir, "project.sb3");

  try {
    await fs.promises.mkdir(tempDir, { recursive: true });
    const metaRes = await axios.get(metaUrl);
    const meta = metaRes.data;
    const token = meta.project_token;
    if (!token) return res.status(400).send("このプロジェクトは公開されていません。");

    const projectUrl = `https://projects.scratch.mit.edu/${projectId}?token=${token}`;
    const projectRes = await axios.get(projectUrl);
    await fs.promises.writeFile(jsonPath, JSON.stringify(projectRes.data, null, 2));

    const output = fs.createWriteStream(sb3Path);
    const archive = archiver("zip");
    archive.pipe(output);
    archive.file(jsonPath, { name: "project.json" });
    await archive.finalize();

    output.on("close", async () => {
      res.download(sb3Path, `scratch-project-${projectId}.sb3`, async (err) => {
        if (err) console.error(err);
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      });
    });
  } catch (err) {
    console.error("[Scratch Error]", err.message);
    res.status(500).send("Scratchプロジェクトの取得に失敗しました。");
  }
});

// ============================================================
// 📱 QRコードメーカー (GET)
// ============================================================
// server.jsの /download エンドポイントを以下のように修正
// server.jsの /download エンドポイントを修正
app.get("/download", async (req, res) => {
  let { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URLを入力してください。" });
  }

  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  try {
    const safeFileName = url.replace(/[^a-z0-9]/gi, "_") + ".html";
    const filePath = path.join(__dirname, safeFileName);

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      }
    });

    fs.writeFileSync(filePath, response.data.toString("utf8"), "utf8");

    res.download(filePath, safeFileName, (err) => {
      if (err) {
        console.error("[DOWNLOAD ERROR]", err.message);
      }
      setTimeout(() => fs.unlink(filePath, () => {}), 1000);
    });
  } catch (err) {
    console.error("[HTML ERROR]", err.message);

    // エラーをJSONで返す（テキストではなく）
    if (err.code === 'ENOTFOUND') {
      return res.status(404).json({ error: "URLが見つかりません。正しいURLを入力してください。" });
    } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(408).json({ error: "接続がタイムアウトしました。もう一度お試しください。" });
    }
    return res.status(500).json({ error: "HTMLの取得に失敗しました。URLを確認してください。" });
  }
});
// ============================================================
// 🚀 サーバー起動
// ============================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ ToolsGo running at: http://localhost:${PORT}`);
});

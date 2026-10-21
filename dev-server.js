const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const envFile = path.join(root, ".env.local");
const requiredEnv = ["SUPABASE_URL", "QR_SECRET"];
const port = Number(process.env.PORT || 3000);

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const missing = requiredEnv.filter((name) => !process.env[name]);
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
  missing.push("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
}
const previewMode = missing.length > 0;
if (previewMode) {
  console.warn(`Faltan variables de entorno: ${missing.join(", ")}. El servidor abrirá el prototipo local sin conexión.`);
}

const configHandler = require("./api/config.js");
const qrHandler = require("./api/qr.js");

function responseAdapter(res) {
  return {
    setHeader: (name, value) => res.setHeader(name, value),
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(body) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
      return this;
    },
  };
}

async function readBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 32768) {
      const error = new Error("La solicitud es demasiado grande.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("El cuerpo JSON no es válido.");
    error.status = 400;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const handler = url.pathname === "/api/config"
      ? configHandler
      : url.pathname === "/api/qr"
        ? qrHandler
        : null;
    if (!handler) {
      res.writeHead(404).end("No encontrado.");
      return;
    }

    try {
      req.body = req.method === "POST" ? await readBody(req) : {};
      await handler(req, responseAdapter(res));
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status === 500) console.error("Error del servidor local:", error);
      if (!res.headersSent) {
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          error: status === 500 ? "Error interno del servidor local." : error.message,
        }));
      }
    }
    return;
  }

  if (req.method !== "GET" || (url.pathname !== "/" && url.pathname !== "/index.html")) {
    res.writeHead(404).end("No encontrado.");
    return;
  }

  if (previewMode && url.searchParams.get("preview") !== "1") {
    res.writeHead(302, { Location: "/?preview=1" }).end();
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  fs.createReadStream(path.join(root, "index.html")).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Asistencia disponible en http://localhost:${port}${previewMode ? "/?preview=1 (prototipo sin conexión)" : ""}`);
});

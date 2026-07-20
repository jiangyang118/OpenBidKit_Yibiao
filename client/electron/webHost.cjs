const { app, ipcMain, nativeTheme } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { registerIpcHandlers } = require('./ipc/index.cjs');
const { applyNativeThemeSource } = require('./utils/nativeTheme.cjs');
const {
  getConfigFilePath,
  getGeneratedImagesDir,
  getImageKnowledgeBaseImagesDir,
  getImportedImagesDir,
  getProjectWorkspaceDir,
  getProjectsDir,
} = require('./utils/paths.cjs');

const host = process.env.YIBIAO_WEB_HOST || '127.0.0.1';
const port = Number(process.env.YIBIAO_WEB_PORT || 5174);
const distDir = path.resolve(__dirname, '../dist');
const apiPrefix = '/api/';
const maxBodyBytes = Number(process.env.YIBIAO_WEB_MAX_BODY_BYTES || 100 * 1024 * 1024);
const handlerMap = new Map();
const listenerMap = new Map();
const eventClients = new Set();

app.setName('yibiao-client');
app.setPath('userData', path.join(app.getPath('appData'), 'yibiao-client'));

// The web host is a background HTTP service and never creates a BrowserWindow.
// Keeping its Electron Dock icon visible makes macOS users think the app is
// broken when clicking an icon that has no window to activate.
if (process.platform === 'darwin') {
  app.dock.hide();
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function readStartupConfigFile() {
  try {
    const configFile = getConfigFilePath(app);
    if (!fs.existsSync(configFile)) return {};
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    return config && typeof config === 'object' ? config : {};
  } catch {
    return {};
  }
}

function patchIpcMainForWeb() {
  ipcMain.handle = (channel, handler) => {
    handlerMap.set(channel, handler);
  };
  ipcMain.removeHandler = (channel) => {
    handlerMap.delete(channel);
  };
  ipcMain.on = (channel, listener) => {
    const listeners = listenerMap.get(channel) || [];
    listeners.push(listener);
    listenerMap.set(channel, listeners);
  };
  ipcMain.removeAllListeners = (channel) => {
    if (channel) {
      listenerMap.delete(channel);
      return;
    }
    listenerMap.clear();
  };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  response.end(text);
}

function broadcastEvent(channel, payload) {
  const data = JSON.stringify(payload ?? null);
  for (const response of eventClients) {
    response.write(`event: ${channel}\n`);
    response.write(`data: ${data}\n\n`);
  }
}

class WebContentsBridge extends EventEmitter {
  isDestroyed() {
    return false;
  }

  isLoading() {
    return false;
  }

  send(channel, payload) {
    broadcastEvent(channel, payload);
  }
}

function createMainWindowBridge(webContents) {
  return {
    isDestroyed: () => false,
    webContents,
  };
}

function createInvokeEvent(sender) {
  return { sender };
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error('请求体过大');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

async function handleInvoke(request, response, sender) {
  try {
    const body = await readJsonBody(request);
    const channel = String(body.channel || '');
    const args = Array.isArray(body.args) ? body.args : [];
    const handler = handlerMap.get(channel);
    if (!handler) {
      sendJson(response, 404, { success: false, message: `未注册的 Web API 通道：${channel}` });
      return;
    }
    const result = await handler(createInvokeEvent(sender), ...args);
    sendJson(response, 200, { success: true, result });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      success: false,
      message: error?.message || String(error),
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    });
  }
}

function handleEvents(request, response, sender) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.write(': connected\n\n');
  eventClients.add(response);

  for (const listener of listenerMap.get('tasks:subscribe') || []) {
    listener(createInvokeEvent(sender));
  }

  request.on('close', () => {
    eventClients.delete(response);
  });
}

function safeResolve(baseDir, relativePath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return null;
  return target;
}

function getProjectWorkspaceCandidates() {
  const candidates = new Set();
  candidates.add(getProjectWorkspaceDir(app, 'default'));
  try {
    const projectsDir = getProjectsDir(app);
    if (fs.existsSync(projectsDir)) {
      for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.add(path.join(projectsDir, entry.name, 'workspace'));
        }
      }
    }
  } catch {}
  return [...candidates];
}

function getAssetRootCandidates(kind) {
  const workspaceCandidates = getProjectWorkspaceCandidates();
  if (kind === 'generated-images') {
    return [getGeneratedImagesDir(app), ...workspaceCandidates.map((workspaceDir) => path.join(workspaceDir, 'generated-images'))];
  }
  if (kind === 'imported-images') {
    return [getImportedImagesDir(app), ...workspaceCandidates.map((workspaceDir) => path.join(workspaceDir, 'imported-images'))];
  }
  if (kind === 'image-knowledge-base') {
    return [
      getImageKnowledgeBaseImagesDir(app),
      ...workspaceCandidates.map((workspaceDir) => path.join(workspaceDir, 'image-knowledge-base', 'images')),
    ];
  }
  return [];
}

function sendFile(response, filePath, cacheControl = 'no-store') {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || 'application/octet-stream';
  response.writeHead(200, {
    'content-type': contentType,
    'cache-control': cacheControl,
  });
  fs.createReadStream(filePath).pipe(response);
}

function handleAsset(requestUrl, response) {
  const match = /^\/api\/assets\/([^/]+)\/?(.*)$/i.exec(requestUrl.pathname);
  if (!match) {
    sendText(response, 404, 'Not found');
    return;
  }

  const kind = decodeURIComponent(match[1]);
  const relativePath = decodeURIComponent(match[2] || '');
  if (!relativePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  for (const root of getAssetRootCandidates(kind)) {
    const filePath = safeResolve(root, relativePath);
    if (filePath && fs.existsSync(filePath)) {
      sendFile(response, filePath, 'public, max-age=3600');
      return;
    }
  }

  sendText(response, 404, 'Not found');
}

function handleStatic(requestUrl, response) {
  const rawPathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = rawPathname === '/' ? 'index.html' : rawPathname.replace(/^\/+/, '');
  let filePath = safeResolve(distDir, relativePath);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  if (!safeResolve(distDir, path.relative(distDir, filePath)) || !fs.existsSync(filePath)) {
    sendText(response, 404, '请先运行 npm run build 生成 dist');
    return;
  }

  sendFile(response, filePath, relativePath === 'index.html' ? 'no-store' : 'public, max-age=3600');
}

function startHttpServer(sender) {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
      sendJson(response, 200, { success: true, appName: '易标投标工具箱', mode: 'web', port });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/api/events') {
      handleEvents(request, response, sender);
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/api/invoke') {
      void handleInvoke(request, response, sender);
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/assets/')) {
      handleAsset(requestUrl, response);
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      handleStatic(requestUrl, response);
      return;
    }
    sendText(response, 405, 'Method not allowed');
  });

  server.listen(port, host, () => {
    const localUrl = `http://${host}:${port}`;
    console.log(`[web] 易标网页版已启动：${localUrl}`);
    console.log(`[web] ngrok 暴露命令：ngrok http ${localUrl}`);
  });

  return server;
}

app.whenReady().then(() => {
  patchIpcMainForWeb();
  applyNativeThemeSource(nativeTheme, readStartupConfigFile());
  const webContents = new WebContentsBridge();
  const mainWindow = createMainWindowBridge(webContents);
  const updateUnavailable = async () => ({ enabled: false, updateAvailable: false, message: '网页版不支持桌面自动更新' });

  registerIpcHandlers({
    app,
    mainWindow,
    checkAndDownloadUpdate: updateUnavailable,
    triggerUpdateDownload: updateUnavailable,
    quitAndInstall: () => undefined,
    getLatestVersion: () => ({ version: app.getVersion(), name: app.getVersion(), body: '', published_at: '', html_url: '' }),
    getUpdateDownloadUrl: () => '',
    gpuStartupState: { hardwareAccelerationEnabled: false, forcedDisabled: true },
    nativeTheme,
  });

  const sender = webContents;
  startHttpServer(sender);
});

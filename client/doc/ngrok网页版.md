# ngrok 网页版运行说明

## 定位

当前网页版是本机托管模式：保留 Electron Main 的本地文件、SQLite、AI、导出和后台任务能力，用一个本机 HTTP 服务把 React 页面和 `window.yibiao` API 暴露出来，再通过 ngrok 生成外网访问地址。

这不是纯 SaaS 多租户部署。远程访问者会共用运行机器上的配置、项目工作区和 API Key，因此只适合可信试用、演示或小范围协作。

## 启动

```bash
cd client
npm run web
```

默认地址：

```text
http://127.0.0.1:5174
```

启动后再开一个终端执行：

```bash
ngrok http http://127.0.0.1:5174
```

把 ngrok 输出的 `https://...ngrok-free.app` 链接发给试用者即可。

## 可配置项

- `YIBIAO_WEB_HOST`：默认 `127.0.0.1`
- `YIBIAO_WEB_PORT`：默认 `5174`
- `YIBIAO_WEB_MAX_BODY_BYTES`：默认 `104857600`

示例：

```bash
YIBIAO_WEB_PORT=8088 npm run web
ngrok http http://127.0.0.1:8088
```

## 已知限制

- 浏览器远端无法真实弹出运行机器的文件选择框给对方挑本地文件；现有依赖系统文件选择框的导入功能仍更适合在主机端操作。
- 导出文件默认保存到运行机器的本地路径，第一版不会自动变成浏览器下载。
- 多个访问者共用同一个本地工作区，不能当作隔离账号系统使用。
- 桌面自动更新和 GPU 相关设置在网页版中仅保留兼容响应。

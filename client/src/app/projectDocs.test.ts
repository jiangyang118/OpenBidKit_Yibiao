import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(currentDir, '../..');

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');
}

describe('project documentation status', () => {
  it('keeps resource and rejection-check docs aligned with implemented features', () => {
    const resourcesDoc = readProjectFile('doc/资源下载.md');
    const rejectionDoc = readProjectFile('doc/废标项检查.md');

    expect(resourcesDoc).toContain('当前客户端已经从 Analytics 资源接口读取真实资源列表');
    expect(resourcesDoc).toContain('接口失败时优先展示离线缓存');
    expect(resourcesDoc).not.toContain('暂时先不做接口');
    expect(resourcesDoc).not.toContain('先做静态数据');
    expect(resourcesDoc).not.toContain('后续这里会从资源接口读取');

    expect(rejectionDoc).toContain('当前页面已经接入真实 Main 侧解析、检查、持久化和报告导出链路');
    expect(rejectionDoc).toContain('报告导出支持 Markdown、Word `.docx` 和文本型 PDF');
    expect(rejectionDoc).not.toContain('随便写上去占位');
    expect(rejectionDoc).not.toContain('可以全部删除');
  });
});

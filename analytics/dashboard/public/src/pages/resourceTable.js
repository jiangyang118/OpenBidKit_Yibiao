import { formatResourceClickCount } from './resourceStats.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function truncate(value, maxLength = 80) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function splitTags(value) {
  return String(value || '')
    .split(/[，,;；\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderResourceImage(resource) {
  if (resource.imageUrl) {
    return `<img class="resource-thumb" src="${escapeHtml(resource.imageUrl)}" alt="" />`;
  }

  return '<span class="resource-thumb-placeholder">无图片</span>';
}

function renderResourceTags(resource) {
  const tags = resource.tags?.length ? resource.tags : splitTags(resource.tagsText);
  if (!tags.length) {
    return '-';
  }

  return `<div class="resource-tag-list">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
}

export function buildResourcesTableHtml(resources = []) {
  if (!resources.length) {
    return '<div class="empty">暂无资源，请先新增一条资源。</div>';
  }

  const rows = resources.map((resource) => `
    <tr>
      <td class="resource-image-cell">${renderResourceImage(resource)}</td>
      <td class="resource-title-cell"><strong>${escapeHtml(resource.title)}</strong><br /><small>${escapeHtml(resource.enabled ? '启用' : '停用')} · 排序 ${escapeHtml(resource.sortOrder)}</small></td>
      <td class="resource-tags-cell">${renderResourceTags(resource)}</td>
      <td>${escapeHtml(formatResourceClickCount(resource.clickCount))}</td>
      <td class="resource-description-cell">${escapeHtml(truncate(resource.description, 90) || '-')}</td>
      <td class="resource-modal-cell">${escapeHtml(truncate(resource.modalContent, 80) || '-')}</td>
      <td class="resource-row-actions">
        <button type="button" class="secondary-button" data-resource-action="edit" data-resource-id="${escapeHtml(resource.id)}">编辑</button>
        <button type="button" class="danger-button" data-resource-action="delete" data-resource-id="${escapeHtml(resource.id)}">删除</button>
      </td>
    </tr>
  `).join('');

  return `
    <table class="resource-table">
      <thead>
        <tr>
          <th>图片</th>
          <th>标题</th>
          <th>标签</th>
          <th>累计点击量</th>
          <th>介绍</th>
          <th>弹窗内容</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, type FormEvent } from 'react';
import { trackResourceClick } from '../../../shared/analytics/analytics';
import { MarkdownRenderer, useToast } from '../../../shared/ui';

interface ResourceItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  modalContent: string;
  imageUrl: string;
  analyticsKey: string;
  clickCount: number;
}

type ResourceTone = 'blue' | 'violet' | 'cyan' | 'slate';

const RESOURCES_ENDPOINT = 'https://analytics.agnet.top/resources';
const resourceTones: ResourceTone[] = ['blue', 'violet', 'cyan', 'slate'];
const clickCountFormatter = new Intl.NumberFormat('zh-CN');

interface ResourcesResponse {
  code: number;
  resources?: ResourceItem[];
  message?: string;
}

interface ResourceCachePayload {
  resources: ResourceItem[];
  cachedAt: string;
}

const RESOURCES_CACHE_KEY = 'yibiao.resources.cache.v1';

function ResourcesPage() {
  const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [resourceStatus, setResourceStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    void loadResources('');
  }, []);

  const loadResources = async (query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) {
        params.set('q', query.trim());
      }

      const queryString = params.toString();
      const url = queryString ? `${RESOURCES_ENDPOINT}?${queryString}` : RESOURCES_ENDPOINT;
      const response = await fetch(url);
      const data = await response.json().catch(() => null) as ResourcesResponse | null;
      if (!response.ok || !data || data.code !== 0) {
        throw new Error(data?.message || `资源读取失败：${response.status}`);
      }

      const nextResources = (data.resources || []).map(normalizeResource).filter((item) => item.id || item.title);
      setResources(nextResources);
      setResourceStatus(nextResources.length ? '资源列表已更新' : '');
      writeResourceCache(nextResources);
    } catch (error) {
      const fallbackResources = readResourceCache();
      const filteredResources = filterResources(fallbackResources, query);
      if (filteredResources.length) {
        setResources(filteredResources);
        setResourceStatus(`当前显示离线缓存资源，最近同步：${formatCacheTime(readResourceCacheTime())}`);
        showToast('资源接口暂不可用，已显示本地缓存', 'info');
      } else {
        setResources([]);
        setResourceStatus('资源接口暂不可用，且本机暂无可用缓存');
        showToast(error instanceof Error ? error.message : '资源读取失败', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadResources(searchText);
  };

  return (
    <>
      <div className="resources-page">
        <section className="resources-shelf-panel" aria-label="资源列表">
          <div className="resources-shelf-head">
            <div>
              <span className="section-kicker">资源下载</span>
              <h3>精选资源</h3>
              {resourceStatus ? <p>{resourceStatus}</p> : null}
            </div>
            <form className="resources-search-form" onSubmit={handleSearchSubmit}>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索标题、标签或介绍"
                aria-label="搜索资源"
              />
              <button type="submit" className="primary-action" disabled={loading}>{loading ? '搜索中' : '搜索'}</button>
            </form>
          </div>

          <div className="resources-shelf-list">
            {resources.map((item) => (
              <button
                type="button"
                className="resource-book-row"
                key={item.id}
                onClick={() => {
                  trackResourceClick(item.analyticsKey);
                  setSelectedResource(item);
                }}
                aria-label={`查看资源：${item.title}`}
              >
                <ResourceCover item={item} />

                <span className="resource-book-copy">
                  <span className="resource-book-meta">
                    {(item.tags.length ? item.tags : ['资源']).map((tag) => <span key={tag}>{tag}</span>)}
                  </span>
                  <strong className="resource-book-title">{item.title}</strong>
                  <span className="resource-book-description">{item.description}</span>
                  <span className="resource-book-stats">累计点击 {formatResourceClickCount(item.clickCount)} 次</span>
                </span>
              </button>
            ))}
            {!loading && resources.length === 0 ? (
              <div className="resources-empty-state">
                <strong>{resourceStatus ? '暂时无法显示资源' : '暂无资源'}</strong>
                <span>{resourceStatus || (searchText.trim() ? '没有匹配当前关键词的资源。' : '资源管理后台还没有上架资源。')}</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <Dialog.Root open={Boolean(selectedResource)} onOpenChange={(open) => !open && setSelectedResource(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="resource-detail-card">
            <div className="resource-detail-head">
              <div>
                <span>{selectedResource?.tags.length ? selectedResource.tags.join(' · ') : '资源详情'}</span>
                <Dialog.Title>{selectedResource?.title || '资源详情'}</Dialog.Title>
              </div>
              <Dialog.Close className="detail-help-close" type="button" aria-label="关闭资源详情">×</Dialog.Close>
            </div>
            <Dialog.Description asChild>
              <div className="resource-detail-body">
                {selectedResource ? <ResourceCover item={selectedResource} /> : null}
                <div className="resource-detail-markdown">
                  <MarkdownRenderer allowRawHtml={false}>
                    {selectedResource?.modalContent || '暂无下载说明。'}
                  </MarkdownRenderer>
                </div>
              </div>
            </Dialog.Description>
            <div className="resource-detail-actions">
              <Dialog.Close className="primary-action" type="button">知道了</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function ResourceCover({ item }: { item: ResourceItem }) {
  if (item.imageUrl) {
    return <img className="resource-book-image" src={item.imageUrl} alt="" />;
  }

  const tone = getResourceTone(item);
  const coverTitle = getCoverTitle(item.title);
  const coverSubtitle = item.tags[0] || 'Resource';

  return (
    <span className={`resource-book-cover is-${tone}`} aria-hidden="true">
      <span>{coverSubtitle}</span>
      <strong>{coverTitle}</strong>
      <small>资源</small>
    </span>
  );
}

function normalizeResource(item: ResourceItem): ResourceItem {
  return {
    id: String(item.id || ''),
    title: String(item.title || '未命名资源'),
    description: String(item.description || ''),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag)).filter(Boolean) : [],
    modalContent: String(item.modalContent || ''),
    imageUrl: String(item.imageUrl || ''),
    analyticsKey: String(item.analyticsKey || ''),
    clickCount: normalizeClickCount(item.clickCount),
  };
}

function readResourceCachePayload(): ResourceCachePayload | null {
  try {
    const raw = localStorage.getItem(RESOURCES_CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<ResourceCachePayload>;
    const resources = Array.isArray(payload.resources)
      ? payload.resources.map((item) => normalizeResource(item as ResourceItem)).filter((item) => item.id || item.title)
      : [];
    if (!resources.length) return null;
    return {
      resources,
      cachedAt: typeof payload.cachedAt === 'string' ? payload.cachedAt : '',
    };
  } catch {
    return null;
  }
}

function readResourceCache() {
  return readResourceCachePayload()?.resources || [];
}

function readResourceCacheTime() {
  return readResourceCachePayload()?.cachedAt || '';
}

function writeResourceCache(resources: ResourceItem[]) {
  if (!resources.length) return;
  try {
    const payload: ResourceCachePayload = {
      resources,
      cachedAt: new Date().toISOString(),
    };
    localStorage.setItem(RESOURCES_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // 资源缓存失败不影响主流程。
  }
}

function filterResources(resources: ResourceItem[], query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return resources;
  return resources.filter((item) => [
    item.title,
    item.description,
    item.modalContent,
    ...item.tags,
  ].some((value) => value.toLowerCase().includes(keyword)));
}

function formatCacheTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function normalizeClickCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function formatResourceClickCount(value: number) {
  return clickCountFormatter.format(normalizeClickCount(value));
}

function getCoverTitle(title: string) {
  return Array.from(title || '资源').slice(0, 4).join('');
}

function getResourceTone(item: ResourceItem): ResourceTone {
  const seed = `${item.id}:${item.title}`;
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return resourceTones[hash % resourceTones.length];
}

export default ResourcesPage;

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui';
import type { ImageKnowledgeAsset, ImageKnowledgeAssetPatch, ImageKnowledgeReference, ImageKnowledgeState } from '../types';

const emptyState: ImageKnowledgeState = {
  assets: [],
  categories: [],
  folders: [],
  tags: [],
};

function tagsText(tags: string[]) {
  return tags.join('，');
}

function parseTags(value: string) {
  return value.split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean);
}

function ImageKnowledgeBasePage() {
  const { showToast } = useToast();
  const [state, setState] = useState<ImageKnowledgeState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [folder, setFolder] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [references, setReferences] = useState<ImageKnowledgeReference[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchCategory, setBatchCategory] = useState('');
  const [batchFolder, setBatchFolder] = useState('');
  const [batchTags, setBatchTags] = useState('');
  const [tagToManage, setTagToManage] = useState('');
  const [newTagName, setNewTagName] = useState('');

  const activeAsset = useMemo(
    () => state.assets.find((asset) => asset.id === activeId) || state.assets[0] || null,
    [activeId, state.assets],
  );
  const selectedCount = selectedIds.length;

  const loadAssets = async (nextKeyword = keyword, nextCategory = category, nextFolder = folder) => {
    const loader = window.yibiao?.imageKnowledgeBase?.list;
    if (!loader) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextState = await loader({ keyword: nextKeyword, category: nextCategory, folder: nextFolder });
      setState(nextState);
      setActiveId((prev) => nextState.assets.some((asset) => asset.id === prev) ? prev : nextState.assets[0]?.id || null);
      setSelectedIds((prev) => prev.filter((id) => nextState.assets.some((asset) => asset.id === id)));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片知识库加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssets('', '', '');
    // 初次加载只走一次，搜索和筛选由交互触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) {
      setReferences([]);
      return;
    }

    window.yibiao?.imageKnowledgeBase?.listReferences(activeId)
      .then((items) => setReferences(items || []))
      .catch((error) => {
        console.warn('图片引用记录加载失败', error);
        setReferences([]);
      });
  }, [activeId]);

  const search = () => {
    void loadAssets(keyword, category, folder);
  };

  const uploadImages = async () => {
    const uploader = window.yibiao?.imageKnowledgeBase?.uploadImages;
    if (!uploader) {
      showToast('当前环境不支持上传图片，请在桌面客户端中使用', 'error');
      return;
    }
    setUploading(true);
    try {
      const result = await uploader();
      setState({ assets: result.assets, categories: result.categories, folders: result.folders, tags: result.tags });
      setActiveId(result.assets[0]?.id || null);
      setSelectedIds([]);
      showToast(result.message, result.imported ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const updateAsset = async (asset: ImageKnowledgeAsset, patch: ImageKnowledgeAssetPatch) => {
    setState((prev) => ({
      ...prev,
      assets: prev.assets.map((item) => item.id === asset.id ? { ...item, ...patch } : item),
    }));
    try {
      const nextState = await window.yibiao?.imageKnowledgeBase?.updateAsset(asset.id, patch);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片信息保存失败', 'error');
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((item) => item !== id);
    });
  };

  const batchUpdateSelected = async (patch: Pick<ImageKnowledgeAssetPatch, 'category' | 'folder' | 'tags'>, appendTags = false) => {
    if (!selectedIds.length) {
      showToast('请先选择图片素材', 'info');
      return;
    }
    const updater = window.yibiao?.imageKnowledgeBase?.batchUpdateAssets;
    if (!updater) {
      showToast('当前环境不支持批量更新图片，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await updater({ ids: selectedIds, patch, appendTags });
      setState({ assets: result.assets, categories: result.categories, folders: result.folders, tags: result.tags });
      setSelectedIds((prev) => prev.filter((id) => result.assets.some((asset) => asset.id === id)));
      showToast(result.message, result.affected ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片批量更新失败', 'error');
    }
  };

  const applyBatchCategory = () => {
    if (!batchCategory.trim()) {
      showToast('请先填写批量分类', 'info');
      return;
    }
    void batchUpdateSelected({ category: batchCategory });
  };

  const applyBatchFolder = () => {
    if (!batchFolder.trim()) {
      showToast('请先填写批量文件夹', 'info');
      return;
    }
    void batchUpdateSelected({ folder: batchFolder });
  };

  const appendBatchTags = () => {
    const tags = parseTags(batchTags);
    if (!tags.length) {
      showToast('请先填写要追加的标签', 'info');
      return;
    }
    void batchUpdateSelected({ tags }, true);
  };

  const deleteAsset = async (asset: ImageKnowledgeAsset) => {
    try {
      const nextState = await window.yibiao?.imageKnowledgeBase?.deleteAsset(asset.id);
      if (nextState) {
        setState(nextState);
        setActiveId(nextState.assets[0]?.id || null);
      }
      showToast('图片素材已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片删除失败', 'error');
    }
  };

  const batchDeleteSelected = async () => {
    if (!selectedIds.length) {
      showToast('请先选择图片素材', 'info');
      return;
    }
    const deleter = window.yibiao?.imageKnowledgeBase?.batchDeleteAssets;
    if (!deleter) {
      showToast('当前环境不支持批量删除图片，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await deleter(selectedIds);
      setState({ assets: result.assets, categories: result.categories, folders: result.folders, tags: result.tags });
      setActiveId(result.assets[0]?.id || null);
      setSelectedIds([]);
      showToast(result.message, result.affected ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片批量删除失败', 'error');
    }
  };

  const renameSelectedTag = async () => {
    if (!tagToManage || !newTagName.trim()) {
      showToast('请先选择标签并填写新标签名', 'info');
      return;
    }
    const renamer = window.yibiao?.imageKnowledgeBase?.renameTag;
    if (!renamer) {
      showToast('当前环境不支持标签重命名，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await renamer(tagToManage, newTagName);
      setState({ assets: result.assets, categories: result.categories, folders: result.folders, tags: result.tags });
      setTagToManage(result.tags.includes(newTagName) ? newTagName : '');
      setNewTagName('');
      showToast(result.message, result.affected ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '标签重命名失败', 'error');
    }
  };

  const deleteSelectedTag = async () => {
    if (!tagToManage) {
      showToast('请先选择要删除的标签', 'info');
      return;
    }
    const deleter = window.yibiao?.imageKnowledgeBase?.deleteTag;
    if (!deleter) {
      showToast('当前环境不支持删除标签，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await deleter(tagToManage);
      setState({ assets: result.assets, categories: result.categories, folders: result.folders, tags: result.tags });
      setTagToManage('');
      showToast(result.message, result.affected ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '标签删除失败', 'error');
    }
  };

  return (
    <div className="image-knowledge-page">
      <section className="image-knowledge-command-panel">
        <div>
          <span className="section-kicker">图片知识库</span>
          <h2>图片素材、图示和资质扫描件管理</h2>
          <p>集中管理投标文件中常用的产品图、流程图、现场照片、荣誉证书、资质扫描件和截图素材。</p>
        </div>
        <button type="button" className="primary-action" onClick={uploadImages} disabled={uploading}>
          {uploading ? '正在上传...' : '上传图片'}
        </button>
      </section>

      <section className="image-knowledge-toolbar">
        <label>
          <span>搜索</span>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && search()} placeholder="标题、文件夹、描述、来源、场景或标签" />
        </label>
        <label>
          <span>分类</span>
          <select value={category} onChange={(event) => { setCategory(event.target.value); void loadAssets(keyword, event.target.value, folder); }}>
            <option value="">全部分类</option>
            {state.categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>文件夹</span>
          <select value={folder} onChange={(event) => { setFolder(event.target.value); void loadAssets(keyword, category, event.target.value); }}>
            <option value="">全部文件夹</option>
            {state.folders.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" className="secondary-action" onClick={search}>筛选</button>
      </section>

      <div className="image-knowledge-grid">
        <section className="image-knowledge-list-panel">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">素材列表</span>
              <h3>{state.assets.length} 张图片</h3>
            </div>
            {loading ? <span className="demo-soft-pill">加载中</span> : null}
          </div>

          <div className="image-knowledge-batch-panel" aria-label="图片批量管理">
            <strong>已选择 {selectedCount} 张</strong>
            <input value={batchCategory} onChange={(event) => setBatchCategory(event.target.value)} aria-label="批量分类" placeholder="批量分类" />
            <button type="button" className="secondary-action" onClick={applyBatchCategory} disabled={!selectedCount || !batchCategory.trim()}>批量设置分类</button>
            <input value={batchFolder} onChange={(event) => setBatchFolder(event.target.value)} aria-label="批量文件夹" placeholder="批量文件夹" />
            <button type="button" className="secondary-action" onClick={applyBatchFolder} disabled={!selectedCount || !batchFolder.trim()}>批量设置文件夹</button>
            <input value={batchTags} onChange={(event) => setBatchTags(event.target.value)} aria-label="追加标签" placeholder="追加标签，用逗号分隔" />
            <button type="button" className="secondary-action" onClick={appendBatchTags} disabled={!selectedCount || !batchTags.trim()}>批量追加标签</button>
            <button type="button" className="secondary-action is-danger" onClick={() => { void batchDeleteSelected(); }} disabled={!selectedCount}>批量删除所选</button>
            <button type="button" className="secondary-action" onClick={() => setSelectedIds([])} disabled={!selectedCount}>清空选择</button>
          </div>

          <div className="image-knowledge-tag-panel" aria-label="图片标签管理">
            <strong>标签管理</strong>
            <select value={tagToManage} onChange={(event) => setTagToManage(event.target.value)} aria-label="选择标签">
              <option value="">选择标签</option>
              {state.tags.map((tag) => <option value={tag} key={tag}>{tag}</option>)}
            </select>
            <input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} aria-label="新标签名" placeholder="新标签名" />
            <button type="button" className="secondary-action" onClick={() => { void renameSelectedTag(); }} disabled={!tagToManage || !newTagName.trim()}>重命名标签</button>
            <button type="button" className="secondary-action is-danger" onClick={() => { void deleteSelectedTag(); }} disabled={!tagToManage}>删除标签</button>
          </div>

          {state.assets.length ? (
            <div className="image-knowledge-card-grid">
              {state.assets.map((asset) => (
                <article
                  className={`image-knowledge-card${activeAsset?.id === asset.id ? ' is-active' : ''}`}
                  key={asset.id}
                >
                  <label className="image-knowledge-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(asset.id)}
                      onChange={(event) => toggleSelected(asset.id, event.target.checked)}
                      aria-label={`选择${asset.title || asset.fileName}`}
                    />
                    <span>选择</span>
                  </label>
                  <button type="button" className="image-knowledge-card-main" onClick={() => setActiveId(asset.id)}>
                    <img src={asset.thumbnailDataUrl} alt={asset.title || asset.fileName} />
                    <strong>{asset.title || asset.fileName}</strong>
                    <span>{asset.folder || '未分组'} · {asset.category || '未分类'} · {asset.width}x{asset.height}</span>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-panel is-large">
              <strong>暂无图片素材</strong>
              <span>上传图片后可按分类、标签、来源和适用场景检索。</span>
            </div>
          )}
        </section>

        <aside className="image-knowledge-detail-panel">
          {activeAsset ? (
            <>
              <img className="image-knowledge-preview" src={activeAsset.thumbnailDataUrl} alt={activeAsset.title || activeAsset.fileName} />
              <label>
                <span>标题</span>
                <input value={activeAsset.title} onChange={(event) => updateAsset(activeAsset, { title: event.target.value })} />
              </label>
              <label>
                <span>分类</span>
                <input value={activeAsset.category} onChange={(event) => updateAsset(activeAsset, { category: event.target.value })} />
              </label>
              <label>
                <span>素材文件夹</span>
                <input value={activeAsset.folder} onChange={(event) => updateAsset(activeAsset, { folder: event.target.value })} />
              </label>
              <label>
                <span>标签</span>
                <input value={tagsText(activeAsset.tags)} onChange={(event) => updateAsset(activeAsset, { tags: parseTags(event.target.value) })} />
              </label>
              <label>
                <span>来源</span>
                <input value={activeAsset.source} onChange={(event) => updateAsset(activeAsset, { source: event.target.value })} placeholder="例如：项目现场、厂家资料、资质证书" />
              </label>
              <label>
                <span>适用场景</span>
                <input value={activeAsset.scenario} onChange={(event) => updateAsset(activeAsset, { scenario: event.target.value })} placeholder="例如：施工组织、售后服务、企业资质" />
              </label>
              <label>
                <span>描述</span>
                <textarea value={activeAsset.description} onChange={(event) => updateAsset(activeAsset, { description: event.target.value })} />
              </label>
              <div className="image-knowledge-meta">
                <span>{activeAsset.mimeType}</span>
                <span>{Math.round(activeAsset.size / 1024)} KB</span>
                <span>引用 {activeAsset.referenceCount} 次</span>
              </div>
              <div className="image-knowledge-reference-list" aria-label="图片引用记录">
                <strong>引用记录</strong>
                {references.length ? (
                  references.map((reference) => (
                    <span key={reference.id}>
                      {reference.targetType === 'technical-plan' ? '技术方案' : reference.targetType} · {reference.targetId}
                    </span>
                  ))
                ) : (
                  <span>暂无引用</span>
                )}
              </div>
              <button type="button" className="secondary-action is-danger" onClick={() => { void deleteAsset(activeAsset); }}>删除图片</button>
            </>
          ) : (
            <div className="empty-panel is-large">
              <strong>选择一张图片</strong>
              <span>这里会显示图片元数据、标签和适用场景。</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default ImageKnowledgeBasePage;

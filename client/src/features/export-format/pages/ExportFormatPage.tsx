import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackPageView } from '../../../shared/analytics/analytics';
import { FloatingToolbar, useToast } from '../../../shared/ui';
import type { FloatingToolbarGroup } from '../../../shared/ui';
import type { ClientConfig } from '../../../shared/types';
import type {
  ExportFormatConfig,
  NumberingFormat,
  PaperSize,
  HeadingStyleConfig,
  BodyTextStyleConfig,
  PageSetupConfig,
  TableStyleConfig,
  ImageExportConfig,
} from '../../../shared/types/exportFormat';
import {
  FONT_OPTIONS,
  SIZE_OPTIONS,
  ALIGNMENT_OPTIONS,
  NUMBERING_FORMATS,
  PAPER_SIZES,
  DEFAULT_EXPORT_FORMAT,
  HEADING_LEVEL_LABELS,
} from '../../../shared/types/exportFormat';
import { formatOutlineNumber } from '../../../shared/utils/outlineNumbering';

// ── 根据当前配置生成每级的编号示例 ──
function headingNumberExample(index: number, fmt: NumberingFormat): string {
  const sampleIds = ['1', '1.1', '1.1.1', '1.1.1.1', '1.1.1.1.1', '1.1.1.1.1.1'];
  return formatOutlineNumber(sampleIds[index] || '1', fmt);
}

function createDefaultExportFormat(): ExportFormatConfig {
  return {
    page: { ...DEFAULT_EXPORT_FORMAT.page },
    headings: DEFAULT_EXPORT_FORMAT.headings.map((heading) => ({ ...heading })),
    body_text: { ...DEFAULT_EXPORT_FORMAT.body_text },
    table: { ...DEFAULT_EXPORT_FORMAT.table },
    image: { ...DEFAULT_EXPORT_FORMAT.image },
  };
}

function normalizeExportFormatConfig(source?: Partial<ExportFormatConfig> | null): ExportFormatConfig {
  const defaults = createDefaultExportFormat();
  if (!source || typeof source !== 'object') return defaults;
  return {
    page: { ...defaults.page, ...(source.page || {}) },
    headings: DEFAULT_EXPORT_FORMAT.headings.map((heading, index) => ({
      ...heading,
      ...(Array.isArray(source.headings) ? source.headings[index] || {} : {}),
    })),
    body_text: { ...defaults.body_text, ...(source.body_text || {}) },
    table: { ...defaults.table, ...(source.table || {}) },
    image: { ...defaults.image, ...(source.image || {}) },
  };
}

function resolveHeaderPreviewRows(config: ExportFormatConfig) {
  const page = config.page;
  const defaultText = page.header_enabled ? page.header_text.trim() : '';
  return [
    {
      label: '首页',
      status: !page.header_enabled
        ? '不显示'
        : page.header_first_page_different
          ? (page.header_first_page_text.trim() ? '使用首页页眉' : '不显示')
          : '使用常规页眉',
      text: page.header_enabled
        ? page.header_first_page_different
          ? page.header_first_page_text.trim()
          : defaultText
        : '',
    },
    {
      label: '奇数页',
      status: page.header_enabled ? '使用常规页眉' : '不显示',
      text: page.header_enabled ? defaultText : '',
    },
    {
      label: '偶数页',
      status: !page.header_enabled
        ? '不显示'
        : page.header_even_odd_different
          ? '使用偶数页页眉'
          : '使用常规页眉',
      text: page.header_enabled
        ? page.header_even_odd_different
          ? (page.header_even_text.trim() || defaultText)
          : defaultText
        : '',
    },
  ];
}

// ── 组件 ──────────────────────────────────────────

function ExportFormatPage() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<ExportFormatConfig>(DEFAULT_EXPORT_FORMAT);
  const [savedConfig, setSavedConfig] = useState<ExportFormatConfig>(DEFAULT_EXPORT_FORMAT);
  const [expandedHeadings, setExpandedHeadings] = useState<Set<number>>(new Set([0, 1]));
  const [loaded, setLoaded] = useState(false);

  // 加载配置
  useEffect(() => {
    trackPageView('export-format');
    let cancelled = false;
    (async () => {
      try {
        const clientConfig = await window.yibiao?.config.load();
        if (cancelled) return;
        const fmt = normalizeExportFormatConfig(clientConfig?.export_format);
        setConfig(fmt);
        setSavedConfig(fmt);
      } catch (error) {
        showToast(`加载配置失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  // 脏检测
  const isDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(savedConfig);
  }, [config, savedConfig]);

  // 页面设置更新
  const updatePage = useCallback((updates: Partial<PageSetupConfig>) => {
    setConfig(prev => ({ ...prev, page: { ...prev.page, ...updates } }));
  }, []);

  // 标题样式更新
  const updateHeading = useCallback((index: number, updates: Partial<HeadingStyleConfig>) => {
    setConfig(prev => ({
      ...prev,
      headings: prev.headings.map((h, i) => i === index ? { ...h, ...updates } : h),
    }));
  }, []);

  // 正文样式更新
  const updateBodyText = useCallback((updates: Partial<BodyTextStyleConfig>) => {
    setConfig(prev => ({ ...prev, body_text: { ...prev.body_text, ...updates } }));
  }, []);

  const updateTable = useCallback((updates: Partial<TableStyleConfig>) => {
    setConfig(prev => ({ ...prev, table: { ...prev.table, ...updates } }));
  }, []);

  const updateImage = useCallback((updates: Partial<ImageExportConfig>) => {
    setConfig(prev => ({ ...prev, image: { ...prev.image, ...updates } }));
  }, []);

  // 保存
  const handleSave = useCallback(async () => {
    try {
      const clientConfig: Partial<ClientConfig> = { export_format: config };
      await window.yibiao?.config.save(clientConfig as ClientConfig);
      setSavedConfig(config);
      showToast('导出格式配置已保存', 'success');
    } catch (error) {
      showToast(`保存失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  }, [config, showToast]);

  const handleResetDefault = useCallback(() => {
    setConfig(createDefaultExportFormat());
    showToast('已恢复默认导出格式，保存后生效', 'info');
  }, [showToast]);

  // 折叠控制
  const toggleHeading = useCallback((index: number) => {
    setExpandedHeadings(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // 工具条
  const resetToolbarGroup: FloatingToolbarGroup = {
    id: 'export-format-reset',
    actions: [
      { id: 'reset-default', label: '重置默认', variant: 'secondary', tooltip: '恢复默认导出格式，保存后生效', onClick: handleResetDefault },
    ],
  };
  const saveToolbarGroups: FloatingToolbarGroup[] = isDirty
    ? [
        {
          id: 'export-format-save-state',
          actions: [
            { id: 'save-indicator', label: '未保存', variant: 'ghost', disabled: true, onClick: () => {} },
          ],
        },
        {
          id: 'export-format-save',
          actions: [
            { id: 'save', label: '保存配置', variant: 'primary', onClick: handleSave },
          ],
        },
      ]
    : [
        {
          id: 'export-format-saved',
          actions: [
            { id: 'saved-indicator', label: '已保存', variant: 'ghost', disabled: true, onClick: () => {} },
          ],
        },
      ];
  const toolbarGroups: FloatingToolbarGroup[] = [
    resetToolbarGroup,
    ...saveToolbarGroups,
  ];
  const headerPreviewRows = resolveHeaderPreviewRows(config);

  if (!loaded) {
    return <div className="export-format-page"><div className="export-format-loading">加载中…</div></div>;
  }

  return (
    <div className="settings-page">
      <div className="settings-page-scroll">
        <header className="export-format-header">
          <span className="section-kicker">导出格式</span>
          <h2>Word 文档排版与编号格式</h2>
          <p>配置导出文档的页面布局、各级标题排版参数和编号规则，配置会实时应用到标书正文预览中</p>
        </header>

        {/* ── 页面设置 ── */}
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>页面设置</strong>
          </div>
          <div className="settings-list">
            <label className="settings-row">
              <div className="settings-row-copy"><strong>纸张</strong></div>
              <select value={config.page.paper_size} onChange={e => updatePage({ paper_size: e.target.value as PaperSize })}>
                {PAPER_SIZES.map(p => <option key={p.value} value={p.value}>{p.label} — {p.detail}</option>)}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy"><strong>方向</strong></div>
              <select value={config.page.orientation} onChange={e => updatePage({ orientation: e.target.value as 'portrait' | 'landscape' })}>
                <option value="portrait">纵向</option>
                <option value="landscape">横向</option>
              </select>
            </label>
            <div className="settings-row">
              <div className="settings-row-copy"><strong>页边距</strong><span>上 / 下 / 左 / 右（厘米）</span></div>
              <div className="export-format-margin-grid">
                <input type="number" min={0} max={10} step={0.1} value={config.page.margin_top_cm} onChange={e => updatePage({ margin_top_cm: Number(e.target.value) })} placeholder="上" />
                <input type="number" min={0} max={10} step={0.1} value={config.page.margin_bottom_cm} onChange={e => updatePage({ margin_bottom_cm: Number(e.target.value) })} placeholder="下" />
                <input type="number" min={0} max={10} step={0.1} value={config.page.margin_left_cm} onChange={e => updatePage({ margin_left_cm: Number(e.target.value) })} placeholder="左" />
                <input type="number" min={0} max={10} step={0.1} value={config.page.margin_right_cm} onChange={e => updatePage({ margin_right_cm: Number(e.target.value) })} placeholder="右" />
              </div>
            </div>
              <label className="settings-row">
                <div className="settings-row-copy"><strong>页脚</strong><span>距底边距离（厘米）</span></div>
                <div className="export-format-switch-row">
                  <label className="settings-switch-control">
                    <input type="checkbox" checked={config.page.footer_enabled} onChange={e => updatePage({ footer_enabled: e.target.checked })} />
                    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                  </label>
                  <input type="number" min={0} max={5} step={0.1} value={config.page.footer_distance_cm} disabled={!config.page.footer_enabled} onChange={e => updatePage({ footer_distance_cm: Number(e.target.value) })} style={{ width: 80 }} />
                </div>
              </label>
              <label className="settings-row">
                <div className="settings-row-copy"><strong>页码格式</strong></div>
                <div className="export-format-switch-row">
                  <label className="settings-switch-control">
                    <input type="checkbox" checked={config.page.page_number_enabled} onChange={e => updatePage({ page_number_enabled: e.target.checked })} />
                    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                  </label>
                  <input type="text" value={config.page.page_number_format} disabled={!config.page.page_number_enabled} onChange={e => updatePage({ page_number_format: e.target.value })} style={{ width: 140 }} />
                </div>
              </label>
              <label className="settings-row">
                <div className="settings-row-copy"><strong>封面页</strong><span>启用后会在正文前插入独立封面，并自动分页到正文首页。</span></div>
                <div className="export-format-switch-row">
                  <label className="settings-switch-control">
                    <input type="checkbox" checked={config.page.cover_enabled} onChange={e => updatePage({ cover_enabled: e.target.checked })} />
                    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                  </label>
                  <input
                    type="text"
                    value={config.page.cover_title}
                    disabled={!config.page.cover_enabled}
                    onChange={e => updatePage({ cover_title: e.target.value })}
                    style={{ minWidth: 220 }}
                    placeholder="投标技术文件"
                  />
                </div>
              </label>
              {config.page.cover_enabled && (
                <div className="settings-row">
                  <div className="settings-row-copy"><strong>封面信息</strong><span>副标题、投标单位和日期会写入封面页，可按项目留空。</span></div>
                  <div className="export-format-heading-grid">
                    <label>
                      <span>副标题</span>
                      <input
                        aria-label="封面副标题"
                        type="text"
                        value={config.page.cover_subtitle}
                        onChange={e => updatePage({ cover_subtitle: e.target.value })}
                        placeholder="技术标"
                      />
                    </label>
                    <label>
                      <span>投标单位</span>
                      <input
                        aria-label="封面投标单位"
                        type="text"
                        value={config.page.cover_company}
                        onChange={e => updatePage({ cover_company: e.target.value })}
                        placeholder="投标单位名称"
                      />
                    </label>
                    <label>
                      <span>日期</span>
                      <input
                        aria-label="封面日期"
                        type="text"
                        value={config.page.cover_date}
                        onChange={e => updatePage({ cover_date: e.target.value })}
                        placeholder="2026年6月15日"
                      />
                    </label>
                  </div>
                </div>
              )}
              <label className="settings-row">
                <div className="settings-row-copy"><strong>目录页</strong><span>启用后会在正文前插入 Word 目录字段，打开 Word/WPS 后可刷新页码。</span></div>
                <div className="export-format-switch-row">
                  <label className="settings-switch-control">
                    <input type="checkbox" checked={config.page.toc_enabled} onChange={e => updatePage({ toc_enabled: e.target.checked })} />
                    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                  </label>
                  <input
                    type="text"
                    value={config.page.toc_title}
                    disabled={!config.page.toc_enabled}
                    onChange={e => updatePage({ toc_title: e.target.value })}
                    style={{ minWidth: 160 }}
                    placeholder="目录"
                  />
                </div>
              </label>
              {config.page.toc_enabled && (
                <div className="settings-row">
                  <div className="settings-row-copy"><strong>目录层级</strong><span>控制 Word 目录收录的标题级别，默认收录 1-3 级标题。</span></div>
                  <div className="export-format-heading-grid">
                    <label>
                      <span>收录到第几级</span>
                      <input
                        aria-label="目录收录层级"
                        type="number"
                        min={1}
                        max={6}
                        step={1}
                        value={config.page.toc_depth}
                        onChange={e => updatePage({ toc_depth: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              )}
              <label className="settings-row">
                <div className="settings-row-copy"><strong>一级章节分节</strong><span>启用后每个一级标题从新的 Word 节开始，便于后续按章设置页眉、页码或页面方向。</span></div>
                <div className="export-format-switch-row">
                  <label className="settings-switch-control">
                    <input type="checkbox" checked={config.page.chapter_section_break_enabled} onChange={e => updatePage({ chapter_section_break_enabled: e.target.checked })} />
                    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                  </label>
                </div>
              </label>
              <label className="settings-row">
                <div className="settings-row-copy"><strong>页眉</strong><span>启用后会写入 Word 页眉，可用于项目名称、投标单位或文档密级。</span></div>
                <div className="export-format-switch-row">
                  <label className="settings-switch-control">
                    <input type="checkbox" checked={config.page.header_enabled} onChange={e => updatePage({ header_enabled: e.target.checked })} />
                    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                  </label>
                  <input
                    type="text"
                    value={config.page.header_text}
                    disabled={!config.page.header_enabled}
                    onChange={e => updatePage({ header_text: e.target.value })}
                    style={{ minWidth: 220 }}
                    placeholder="投标技术文件"
                  />
                </div>
              </label>
              {config.page.header_enabled && (
                <>
                  <label className="settings-row">
                    <div className="settings-row-copy"><strong>首页不同</strong><span>启用后首页使用独立页眉内容，留空则首页不显示页眉。</span></div>
                    <div className="export-format-switch-row">
                      <label className="settings-switch-control">
                        <input type="checkbox" checked={config.page.header_first_page_different} onChange={e => updatePage({ header_first_page_different: e.target.checked })} />
                        <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                      </label>
                      <input
                        type="text"
                        value={config.page.header_first_page_text}
                        disabled={!config.page.header_first_page_different}
                        onChange={e => updatePage({ header_first_page_text: e.target.value })}
                        style={{ minWidth: 220 }}
                        placeholder="首页页眉内容"
                      />
                    </div>
                  </label>
                  <label className="settings-row">
                    <div className="settings-row-copy"><strong>奇偶页不同</strong><span>启用后偶数页使用独立页眉内容，奇数页继续使用常规页眉。</span></div>
                    <div className="export-format-switch-row">
                      <label className="settings-switch-control">
                        <input type="checkbox" checked={config.page.header_even_odd_different} onChange={e => updatePage({ header_even_odd_different: e.target.checked })} />
                        <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                      </label>
                      <input
                        type="text"
                        value={config.page.header_even_text}
                        disabled={!config.page.header_even_odd_different}
                        onChange={e => updatePage({ header_even_text: e.target.value })}
                        style={{ minWidth: 220 }}
                        placeholder="偶数页页眉内容"
                      />
                    </div>
                  </label>
                  <div className="settings-row">
                    <div className="settings-row-copy"><strong>页眉样式</strong><span>字体 / 字号 / 对齐方式，常规、首页和偶数页页眉共用。</span></div>
                    <div className="export-format-margin-grid">
                      <select value={config.page.header_font} onChange={e => updatePage({ header_font: e.target.value })}>
                        {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select value={config.page.header_size} onChange={e => updatePage({ header_size: e.target.value })}>
                        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select value={config.page.header_alignment} onChange={e => updatePage({ header_alignment: e.target.value })}>
                        {ALIGNMENT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
              <label className="settings-row">
                <div className="settings-row-copy"><strong>文字水印</strong><span>启用后会写入 Word 水印层，适合标记内部资料、保密文件或草稿版本。</span></div>
                <div className="export-format-switch-row">
                  <label className="settings-switch-control">
                    <input type="checkbox" checked={config.page.watermark_enabled} onChange={e => updatePage({ watermark_enabled: e.target.checked })} />
                    <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                  </label>
                  <input
                    type="text"
                    value={config.page.watermark_text}
                    disabled={!config.page.watermark_enabled}
                    onChange={e => updatePage({ watermark_text: e.target.value })}
                    style={{ minWidth: 180 }}
                    placeholder="内部资料"
                  />
                </div>
              </label>
              {config.page.watermark_enabled && (
                <div className="settings-row">
                  <div className="settings-row-copy"><strong>水印样式</strong><span>字体、字号、颜色和透明度会进入导出的 Word 文件。</span></div>
                  <div className="export-format-margin-grid">
                    <select value={config.page.watermark_font} onChange={e => updatePage({ watermark_font: e.target.value })}>
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <input
                      type="number"
                      min={12}
                      max={120}
                      step={1}
                      value={config.page.watermark_size_pt}
                      onChange={e => updatePage({ watermark_size_pt: Number(e.target.value) })}
                      aria-label="水印字号"
                    />
                    <input
                      type="color"
                      value={`#${config.page.watermark_color || 'D9D9D9'}`}
                      onChange={e => updatePage({ watermark_color: e.target.value.replace(/^#/, '').toUpperCase() })}
                      aria-label="水印颜色"
                    />
                    <input
                      type="range"
                      min={0.05}
                      max={0.8}
                      step={0.01}
                      value={config.page.watermark_opacity}
                      onChange={e => updatePage({ watermark_opacity: Number(e.target.value) })}
                      aria-label="水印透明度"
                    />
                  </div>
                </div>
              )}
          </div>
        </section>

        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>导出效果说明</strong>
          </div>
          <div className="export-format-header-preview" aria-label="页眉导出效果预览">
            <div className="export-format-header-preview-head">
              <strong>页眉写入规则</strong>
              <p>保存配置后，Word 导出会按下列规则写入页眉；当前页面只展示页眉规则，正文排版仍以导出的 Word 文件为准。</p>
            </div>
            <div className="export-format-header-preview-list">
              {headerPreviewRows.map((row) => (
                <article key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.text || '无页眉'}</strong>
                  <small>{row.status}</small>
                </article>
              ))}
            </div>
            <p className="export-format-header-preview-note">
              字体、字号和对齐方式会同时应用到常规页眉、首页页眉和偶数页页眉。
            </p>
          </div>
        </section>

          {/* ── 各级标题格式 ── */}
          <section className="settings-page-section">
            <div className="settings-section-title">
              <span />
              <strong>各级标题格式</strong>
            </div>
            <div className="export-format-heading-list">
              {config.headings.map((heading, index) => {
                const isExpanded = expandedHeadings.has(index);
                const numExample = headingNumberExample(index, heading.numbering_format);
                return (
                  <div key={index} className={`export-format-heading-card${isExpanded ? ' is-expanded' : ''}`}>
                    <button
                      type="button"
                      className="export-format-heading-header"
                      onClick={() => toggleHeading(index)}
                    >
                      <span className="export-format-heading-label">{HEADING_LEVEL_LABELS[index]}</span>
                      <span className="export-format-heading-example">{numExample || '无编号'}</span>
                      <span className={`export-format-heading-chevron${isExpanded ? ' is-open' : ''}`}>▸</span>
                    </button>
                    {isExpanded && (
                      <div className="export-format-heading-body">
                        <div className="export-format-heading-grid">
                          <label>
                            <span>编号格式</span>
                            <select value={heading.numbering_format} onChange={e => updateHeading(index, { numbering_format: e.target.value as NumberingFormat })}>
                              {NUMBERING_FORMATS.map(nf => <option key={nf.value} value={nf.value}>{nf.label}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>字体</span>
                            <select value={heading.font} onChange={e => updateHeading(index, { font: e.target.value })}>
                              {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>字号</span>
                            <select value={heading.size} onChange={e => updateHeading(index, { size: e.target.value })}>
                              {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>对齐</span>
                            <select value={heading.alignment} onChange={e => updateHeading(index, { alignment: e.target.value })}>
                              {ALIGNMENT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>段前（磅）</span>
                            <input type="number" min={0} max={100} step={1} value={heading.spacing_before_pt} onChange={e => updateHeading(index, { spacing_before_pt: Number(e.target.value) })} />
                          </label>
                          <label>
                            <span>段后（磅）</span>
                            <input type="number" min={0} max={100} step={1} value={heading.spacing_after_pt} onChange={e => updateHeading(index, { spacing_after_pt: Number(e.target.value) })} />
                          </label>
                          <label>
                            <span>首行缩进（字符）</span>
                            <input type="number" min={0} max={10} step={0.5} value={heading.first_line_indent_chars} onChange={e => updateHeading(index, { first_line_indent_chars: Number(e.target.value) })} />
                          </label>
                          <label>
                            <span>行距（倍）</span>
                            <input type="number" min={0.5} max={5} step={0.1} value={heading.line_spacing} onChange={e => updateHeading(index, { line_spacing: Number(e.target.value) })} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 正文格式 ── */}
          <section className="settings-page-section">
            <div className="settings-section-title">
              <span />
              <strong>正文格式</strong>
            </div>
            <div className="export-format-heading-grid">
              <label>
                <span>字体</span>
                <select value={config.body_text.font} onChange={e => updateBodyText({ font: e.target.value })}>
                  {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label>
                <span>字号</span>
                <select value={config.body_text.size} onChange={e => updateBodyText({ size: e.target.value })}>
                  {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>
                <span>对齐</span>
                <select value={config.body_text.alignment} onChange={e => updateBodyText({ alignment: e.target.value })}>
                  {ALIGNMENT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label>
                <span>段前（磅）</span>
                <input type="number" min={0} max={100} step={1} value={config.body_text.spacing_before_pt} onChange={e => updateBodyText({ spacing_before_pt: Number(e.target.value) })} />
              </label>
              <label>
                <span>段后（磅）</span>
                <input type="number" min={0} max={100} step={1} value={config.body_text.spacing_after_pt} onChange={e => updateBodyText({ spacing_after_pt: Number(e.target.value) })} />
              </label>
              <label>
                <span>首行缩进（字符）</span>
                <input type="number" min={0} max={10} step={0.5} value={config.body_text.first_line_indent_chars} onChange={e => updateBodyText({ first_line_indent_chars: Number(e.target.value) })} />
              </label>
              <label>
                <span>行距（倍）</span>
                <input type="number" min={0.5} max={5} step={0.1} value={config.body_text.line_spacing_multiple} onChange={e => updateBodyText({ line_spacing_multiple: Number(e.target.value) })} />
              </label>
            </div>
          </section>

          {/* ── 图片导出策略 ── */}
          <section className="settings-page-section">
            <div className="settings-section-title">
              <span />
              <strong>图片导出策略</strong>
            </div>
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>Word 图片最大宽度</strong>
                <span>用于 Markdown 图片、HTML 图片和图片知识库素材导出，超过该宽度会按比例缩小写入 Word。</span>
              </div>
              <div className="export-format-heading-grid">
                <label>
                  <span>最大宽度（px）</span>
                  <input
                    aria-label="Word 图片最大宽度"
                    type="number"
                    min={160}
                    max={960}
                    step={10}
                    value={config.image.max_width_px}
                    onChange={e => updateImage({ max_width_px: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* ── 表格样式 ── */}
          <section className="settings-page-section">
            <div className="settings-section-title">
              <span />
              <strong>表格样式</strong>
            </div>
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>Word 表格</strong>
                <span>用于 Markdown 表格和可信 HTML 表格导出，统一控制表头底色、边框和单元格留白。</span>
              </div>
              <div className="export-format-heading-grid">
                <label>
                  <span>表头底色</span>
                  <input
                    aria-label="表头底色"
                    type="color"
                    value={`#${config.table.header_fill_color || 'F1F6FF'}`}
                    onChange={e => updateTable({ header_fill_color: e.target.value.replace(/^#/, '').toUpperCase() })}
                  />
                </label>
                <label>
                  <span>外框线颜色</span>
                  <input
                    aria-label="表格外框线颜色"
                    type="color"
                    value={`#${config.table.border_color || 'DCDFF6'}`}
                    onChange={e => updateTable({ border_color: e.target.value.replace(/^#/, '').toUpperCase() })}
                  />
                </label>
                <label>
                  <span>内框线颜色</span>
                  <input
                    aria-label="表格内框线颜色"
                    type="color"
                    value={`#${config.table.inside_border_color || 'E8EDF6'}`}
                    onChange={e => updateTable({ inside_border_color: e.target.value.replace(/^#/, '').toUpperCase() })}
                  />
                </label>
                <label>
                  <span>单元格留白（twip）</span>
                  <input
                    aria-label="表格单元格留白"
                    type="number"
                    min={60}
                    max={360}
                    step={10}
                    value={config.table.cell_margin_twips}
                    onChange={e => updateTable({ cell_margin_twips: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>
      <FloatingToolbar groups={toolbarGroups} label="导出格式保存工具条" />
    </div>
  );
}

export default ExportFormatPage;

export interface ImageKnowledgeAsset {
  id: string;
  fileName: string;
  title: string;
  category: string;
  folder: string;
  description: string;
  source: string;
  scenario: string;
  tags: string[];
  mimeType: string;
  size: number;
  width: number;
  height: number;
  contentHash: string;
  thumbnailDataUrl: string;
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImageKnowledgeReference {
  id: string;
  imageId: string;
  targetType: string;
  targetId: string;
  createdAt: string;
}

export interface ImageKnowledgeState {
  assets: ImageKnowledgeAsset[];
  categories: string[];
  folders: string[];
  tags: string[];
}

export interface ImageKnowledgeSearchQuery {
  keyword?: string;
  category?: string;
  folder?: string;
  tag?: string;
}

export interface ImageKnowledgeAssetPatch {
  title?: string;
  category?: string;
  folder?: string;
  description?: string;
  source?: string;
  scenario?: string;
  tags?: string[];
}

export interface ImageKnowledgeBatchUpdatePayload {
  ids: string[];
  patch: Pick<ImageKnowledgeAssetPatch, 'category' | 'folder' | 'tags'>;
  appendTags?: boolean;
}

export interface ImageKnowledgeBatchResult extends ImageKnowledgeState {
  affected: number;
  message: string;
}

export interface ImageKnowledgeTagMutationResult extends ImageKnowledgeState {
  affected: number;
  message: string;
}

export interface ImageKnowledgeUploadResult extends ImageKnowledgeState {
  imported: number;
  skipped: number;
  message: string;
}

export type ImageKnowledgeArchiveSection = '图片素材图示' | '资质扫描管理';

export interface ImageKnowledgeArchiveImportResult extends ImageKnowledgeUploadResult {
  archives: number;
  categoryCounts?: Record<string, number>;
}

export interface ImageKnowledgeMarkdownReferenceRequest {
  imageId: string;
  targetType: 'technical-plan' | string;
  targetId: string;
}

export interface ImageKnowledgeMarkdownReferenceResult {
  reference: ImageKnowledgeReference;
  markdown: string;
  state: ImageKnowledgeState;
}

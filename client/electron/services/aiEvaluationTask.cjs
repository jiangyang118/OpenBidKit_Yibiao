function appendLog(logs, message) {
  const nextMessage = String(message || '').trim();
  if (!nextMessage) return logs;
  return [...(Array.isArray(logs) ? logs : []), nextMessage].slice(-20);
}

async function runAiEvaluationExtractionTask({ workspaceStore, updateTask }) {
  if (!workspaceStore?.enhanceWithAi) {
    throw new Error('AI 评标任务服务尚未初始化');
  }

  let logs = ['开始执行 AI 评标结构化抽取。'];
  updateTask({ progress: 8, logs }, workspaceStore.loadState());

  const result = await workspaceStore.enhanceWithAi({
    progressCallback: (message) => {
      logs = appendLog(logs, message);
      updateTask({ progress: 62, logs }, workspaceStore.loadState());
    },
  });

  logs = appendLog(logs, result.message || 'AI 评标结构化抽取已完成。');
  updateTask(
    {
      status: 'success',
      progress: 100,
      logs,
      stats: { item_count: result.state?.items?.length || 0 },
    },
    workspaceStore.loadState(),
  );
}

async function runAiEvaluationBatchScoringTask({ workspaceStore, updateTask }) {
  if (!workspaceStore?.scoreImportedBidDocuments) {
    throw new Error('AI 评标批量评分服务尚未初始化');
  }

  let logs = ['开始批量评分已导入投标文件。'];
  updateTask({ progress: 6, logs }, workspaceStore.loadState());

  const result = await workspaceStore.scoreImportedBidDocuments({
    progressCallback: (message, stats = {}) => {
      logs = appendLog(logs, message);
      const documentCount = Number(stats.documentCount || stats.document_count || 0);
      const scoredCount = Number(stats.scoredCount || stats.scored_count || 0);
      const progress = documentCount > 0
        ? Math.min(95, 10 + Math.round((scoredCount / documentCount) * 80))
        : 40;
      updateTask({ progress, logs, stats }, workspaceStore.loadState());
    },
  });

  logs = appendLog(logs, result.message || 'AI 评标批量评分已完成。');
  updateTask(
    {
      status: 'success',
      progress: 100,
      logs,
      stats: result.stats || {},
    },
    workspaceStore.loadState(),
  );
}

module.exports = {
  runAiEvaluationBatchScoringTask,
  runAiEvaluationExtractionTask,
};

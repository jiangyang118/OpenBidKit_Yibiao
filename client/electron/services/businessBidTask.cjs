function appendLog(logs, message) {
  const nextMessage = String(message || '').trim();
  if (!nextMessage) return logs;
  return [...(Array.isArray(logs) ? logs : []), nextMessage].slice(-20);
}

async function runBusinessBidAiExtractionTask({ workspaceStore, updateTask }) {
  if (!workspaceStore?.enhanceWithAi) {
    throw new Error('商务标任务服务尚未初始化');
  }

  let logs = ['开始执行商务标 AI 结构化提取。'];
  updateTask({ progress: 8, logs }, workspaceStore.loadState());

  const result = await workspaceStore.enhanceWithAi({
    progressCallback: (message) => {
      logs = appendLog(logs, message);
      updateTask({ progress: 62, logs }, workspaceStore.loadState());
    },
  });

  logs = appendLog(logs, result.message || '商务标 AI 结构化提取已完成。');
  updateTask(
    {
      status: 'success',
      progress: 100,
      logs,
      stats: { clause_count: result.state?.clauses?.length || 0 },
    },
    workspaceStore.loadState(),
  );
}

module.exports = {
  runBusinessBidAiExtractionTask,
};

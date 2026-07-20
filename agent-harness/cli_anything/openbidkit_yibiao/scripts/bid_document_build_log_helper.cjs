const BID_DOCUMENT_BUILD_LOG_CHECK_KEYS = [
  'templateCheck',
  'quoteCheck',
  'paymentCheck',
  'titleCheck',
  'identityCheck',
  'forbiddenWordsCheck',
  'assetCheck',
  'sectionSelectionCheck',
  'sectionCheck',
  'docxOpenCheck',
  'docxContentCheck',
  'docxSectionOrderCheck',
  'docxTableCheck',
  'docxQuoteIntegrityCheck',
  'docxLayoutCheck',
  'docxTocCheck',
  'docxStyleCheck',
  'docxTechnicalDensityCheck',
  'docxPageBreakCheck',
  'imageInsertionCheck',
  'docxAssetPlacementCheck',
  'docxForbiddenWordsCheck',
];

function notRunValidationResult() {
  return { passed: false, errors: ['not_run'], details: {} };
}

function failedValidationResult(errors, details = {}) {
  return { passed: false, errors: Array.isArray(errors) ? errors : [String(errors)], details };
}

function createTemplateErrorBuildLog(error, templateId = '') {
  const log = Object.fromEntries(BID_DOCUMENT_BUILD_LOG_CHECK_KEYS.map((key) => [key, notRunValidationResult()]));
  const message = error?.message || String(error);
  return {
    ...log,
    templateCheck: failedValidationResult(message, {
      error: error?.code || 'unknown_template_id',
      templateId: error?.templateId || templateId || '',
      availableTemplateIds: error?.availableTemplateIds || [],
    }),
    passed: false,
    errors: [message],
  };
}

function createFailedCheckBuildLog(checkKey, message, details = {}) {
  const log = Object.fromEntries(BID_DOCUMENT_BUILD_LOG_CHECK_KEYS.map((key) => [key, notRunValidationResult()]));
  return {
    ...log,
    [checkKey]: failedValidationResult(message, details),
    passed: false,
    errors: [message],
  };
}

function summarizeBuildLog(buildLog = {}) {
  const summary = {
    passed: Boolean(buildLog.passed),
    errors: buildLog.errors || [],
  };
  for (const key of BID_DOCUMENT_BUILD_LOG_CHECK_KEYS) {
    summary[key] = buildLog[key] || notRunValidationResult();
  }
  if (buildLog.outputPath) summary.outputPath = buildLog.outputPath;
  return summary;
}

module.exports = {
  BID_DOCUMENT_BUILD_LOG_CHECK_KEYS,
  createFailedCheckBuildLog,
  createTemplateErrorBuildLog,
  summarizeBuildLog,
};

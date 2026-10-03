// Internal plan codes are unchanged: plus = Pro Sinh Viên, pro = Master.
export function planPermissions(subscription) {
  const plan = subscription?.plan || 'free';
  const master = plan === 'pro';
  const paid = master || plan === 'plus';
  const limits = master
    ? { max_documents: 200, storage_bytes: 5 * 1024 ** 3, tutor_limit: null, tutor_period: 'month' }
    : paid
      ? { max_documents: 50, storage_bytes: 2 * 1024 ** 3, tutor_limit: 200, tutor_period: 'month' }
      : { max_documents: 10, storage_bytes: 200 * 1024 ** 2, tutor_limit: 5, tutor_period: 'day' };
  const policy = { ...limits, tutor_used: 0, document_count: 0, storage_used_bytes: 0, ...subscription?.permissions };
  return {
    ...policy,
    advancedQuiz: paid,
    aiAnalytics: paid,
    personalizedRoadmap: paid,
    multipleModels: master,
    deepAnalysis: master,
    advancedRoadmap: master,
    canAskTutor: Boolean(subscription?.permissions) && (policy.tutor_limit === null || policy.tutor_used < policy.tutor_limit),
    canUpload: policy.document_count < policy.max_documents && policy.storage_used_bytes < policy.storage_bytes,
  };
}

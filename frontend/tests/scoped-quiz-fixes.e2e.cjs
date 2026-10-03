const { test, expect } = require('@playwright/test');

async function setup(page, context) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const account = await context.request.post('/api/auth/register', { data: {
    first_name: 'Scoped', last_name: 'QA', email: `scoped-${Date.now()}-${Math.random()}@studyhub.test`, password: 'StudyHubTest123!',
  } });
  expect(account.status()).toBe(201);
  const subjects = [];
  for (const [code, name] of [['DB', 'Cơ sở dữ liệu'], ['MATH', 'Toán học']]) {
    const response = await context.request.post('/api/subjects', { data: { code, name } });
    expect(response.status()).toBe(201); subjects.push(await response.json());
  }
  await page.route('**/api/subscription', route => route.fulfill({ json: { plan: 'plus', status: 'active' } }));
  return subjects;
}

test('one home streak, no roadmap upload, library upload remains usable', async ({ page, context }) => {
  const [subject] = await setup(page, context);
  await page.goto('/dashboard');
  await expect(page.locator('.home-page .streak-card')).toHaveCount(1);
  await expect(page.locator('.streak-habit-section .streak-card')).toBeVisible();
  await page.goto('/app/roadmap');
  await expect(page.locator('.roadmap-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload tài liệu/ })).toHaveCount(0);
  await page.locator('.roadmap-create-button').click();
  await expect(page.getByLabel('Môn học', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload tài liệu/ })).toHaveCount(0);
  await page.goto('/app/materials');
  await page.locator('.hero-upload').click();
  const dialog = page.getByRole('dialog', { name: 'Thêm tài liệu vào Kho học liệu' });
  await dialog.locator('#upload-subject').selectOption(subject.code);
  await dialog.locator('#upload-file').setInputFiles({ name: 'source.txt', mimeType: 'text/plain', buffer: Buffer.from('Atomicity ensures a transaction completes or rolls back together.') });
  await expect(dialog.getByRole('button', { name: 'Tải lên & Xử lý' })).toBeEnabled();
  await dialog.locator('#upload-title').fill('Tài liệu kiểm tra');
  await dialog.getByRole('button', { name: 'Tải lên & Xử lý' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.document-card')).toContainText('Tài liệu kiểm tra');
});

test('AI retry preserves draft; saved quizzes display, reload and combine filters', async ({ page, context }) => {
  const [subject, other] = await setup(page, context);
  const upload = await context.request.post('/api/upload', { multipart: {
    subject_id: String(subject.id), title: 'Giao dịch', file: { name: 'source.txt', mimeType: 'text/plain', buffer: Buffer.from('Atomicity ensures a transaction completes or rolls back together. '.repeat(100)) },
  } });
  expect(upload.status()).toBe(201);
  const question = { question: 'Giao dịch bị gián đoạn cần thuộc tính nào để rollback?', options: ['Atomicity', 'Isolation', 'Durability', 'Consistency'], correct_index: 0 };
  const manual = await context.request.post('/api/quizzes/manual', { data: { subject_id: other.id, title: 'Bài tự tạo', questions: [question] } });
  expect(manual.status()).toBe(201);
  const deck = await context.request.post('/api/flashcards/manual', { data: { subject_id: other.id, name: 'Thẻ giữ nguyên', cards: [{ front: 'Atomicity', back: 'All or nothing' }] } });
  expect(deck.status()).toBe(201);
  let fail = true;
  const metadata = new Map();
  // The real provider adapter/persistence is covered by the Python Quiz tests.
  await page.route('**/api/quizzes/generate', async route => {
    if (fail) return route.fulfill({ status: 503, json: { error: 'Nova AI chưa được kết nối.', code: 'ai_not_configured' } });
    const data = route.request().postDataJSON();
    expect(data.subject_id).toBe(subject.id); expect(data.document_ids).toEqual([(await upload.json()).document_id]);
    const response = await context.request.post('/api/quizzes/manual', { data: { subject_id: data.subject_id, title: data.title, questions: [question] } });
    expect(response.status()).toBe(201);
    const quiz = await response.json();
    const fields = { difficulty: data.difficulty, document_ids: data.document_ids };
    metadata.set(quiz.id, fields);
    await route.fulfill({ status: 201, json: { ...quiz, ...fields } });
  });
  await page.route('**/api/quizzes/history', async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ response, json: { items: data.items.map(item => ({ ...item, ...metadata.get(item.id) })) } });
  });
  await page.goto('/app/quiz');
  await page.getByRole('button', { name: 'Tạo bài trắc nghiệm', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Môn học', { exact: true }).selectOption(String(subject.id));
  await dialog.getByLabel('Giao dịch').check();
  await dialog.getByLabel('Tên bài trắc nghiệm', { exact: true }).fill('Bài AI đã lưu');
  await dialog.getByLabel('Số câu hỏi', { exact: true }).fill('1');
  await dialog.getByLabel('Độ khó').selectOption('hard');
  await dialog.getByRole('button', { name: 'Tạo bài với Nova AI' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Nova AI chưa được kết nối');
  await expect(dialog.getByLabel('Giao dịch')).toBeChecked();
  await expect(dialog.getByLabel('Tên bài trắc nghiệm', { exact: true })).toHaveValue('Bài AI đã lưu');
  fail = false;
  await dialog.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/1');
  await page.getByRole('button', { name: 'Về Quiz Card', exact: true }).click();
  await page.reload();
  await expect(page.locator('.qc-quiz')).toHaveCount(2);
  const filters = page.getByRole('form', { name: 'Lọc bài trắc nghiệm' });
  await filters.getByLabel('Chủ đề', { exact: true }).selectOption(String(subject.id));
  await filters.getByLabel('Độ khó', { exact: true }).selectOption('hard');
  await filters.getByLabel('Loại câu hỏi', { exact: true }).selectOption('multiple_choice');
  await expect(page.locator('.qc-quiz')).toHaveCount(1);
  await expect(page.locator('.qc-quiz')).toContainText('Bài AI đã lưu');
  await expect(page.locator('.qc-deck')).toContainText('Thẻ giữ nguyên');
  await filters.getByLabel('Độ khó', { exact: true }).selectOption('easy');
  await expect(page.locator('.qc-quiz')).toHaveCount(0);
  await expect(page.getByText('Không có bài trắc nghiệm phù hợp', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(page.locator('.qc-quiz')).toHaveCount(2);
  await filters.getByLabel('Chủ đề', { exact: true }).selectOption(String(other.id));
  await filters.getByLabel('Độ khó', { exact: true }).selectOption('mixed');
  await expect(page.locator('.qc-quiz')).toContainText('Bài tự tạo');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

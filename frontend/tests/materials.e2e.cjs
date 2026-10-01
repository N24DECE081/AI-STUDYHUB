const { test, expect } = require('@playwright/test');

test('shared MaterialUploader uploads a TXT document into the library', async ({ page, context }) => {
  const email = `material-${Date.now()}@example.com`;
  expect((await context.request.post('/api/auth/register', { data: { name: 'Material Test', email, password: 'StrongPassword123!' } })).ok()).toBeTruthy();
  const subject = await context.request.post('/api/subjects', { data: { code: `MAT${String(Date.now()).slice(-8)}`, name: 'Môn kiểm thử' } });
  expect(subject.status()).toBe(201);
  await page.goto('/app/materials');
  await page.getByRole('button', { name: 'Upload tài liệu mới' }).click();
  const uploader = page.locator('.rm-uploader');
  await expect(uploader).toBeVisible();
  await expect(uploader.getByRole('option', { name: 'Môn kiểm thử' })).toBeAttached();
  await uploader.getByLabel('Môn học của tài liệu').selectOption({ label: 'Môn kiểm thử' });
  await uploader.locator('input[type=file]').setInputFiles({ name: 'nova-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('# Chương 1\nNội dung học thật của người dùng.') });
  await expect(uploader.getByText('Sẵn sàng')).toBeVisible({ timeout: 15000 });
  const documents = await (await context.request.get('/api/documents')).json();
  expect(documents).toHaveLength(1);
  expect(documents[0].original_filename).toBe('nova-notes.txt');

  await page.goto('/app/roadmap');
  await page.getByRole('button', { name: 'Tạo lộ trình mới' }).first().click();
  await page.locator('input[name="roadmap-type"][value="document"]').check();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.getByRole('radio', { name: /nova-notes\.txt/ }).check();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.locator('.rm-goal-list button').first().click();
  const weeks = page.getByLabel('Số tuần');
  const hours = page.getByLabel('Giờ/ngày');
  const days = page.getByLabel('Ngày/tuần');
  await expect(weeks).toHaveAttribute('min', '1'); await expect(weeks).toHaveAttribute('max', '49'); await expect(weeks).toHaveAttribute('step', '1');
  await expect(hours).toHaveAttribute('min', '1'); await expect(hours).toHaveAttribute('max', '24'); await expect(hours).toHaveAttribute('step', '1');
  await expect(days).toHaveAttribute('min', '1'); await expect(days).toHaveAttribute('max', '7'); await expect(days).toHaveAttribute('step', '1');
  await weeks.fill('1.5'); await expect(weeks).toHaveValue('');
  await weeks.fill('50'); await hours.fill('1'); await days.fill('1');
  await page.getByRole('button', { name: 'Tạo lộ trình', exact: true }).click();
  await expect(page.getByText('Số tuần phải là số nguyên từ 1 đến 49.')).toBeVisible();
});

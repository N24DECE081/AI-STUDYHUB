const { test, expect } = require('@playwright/test');

test('roadmap: subject isolation, schedule, API retry, progress, grading and responsive Nova', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const registration = await context.request.post('/api/auth/register', { data: {
    first_name: 'Roadmap', last_name: 'QA', email: `roadmap-${Date.now()}@studyhub.test`, password: 'StudyHubTest123!',
  } });
  expect(registration.ok()).toBe(true);
  const subject = await (await context.request.post('/api/subjects', { data: { code: 'CPP', name: 'Lập trình C++' } })).json();
  const other = await (await context.request.post('/api/subjects', { data: { code: 'DB', name: 'Cơ sở dữ liệu' } })).json();
  const documentIds = [];
  for (const [owner, title, content] of [
    [subject, 'C++ Programming.pdf', '# Biến và kiểu dữ liệu\nBiến lưu trữ dữ liệu.\n# Vòng lặp\nLặp qua các phần tử.'],
    [subject, 'Data Structures.pdf', '# Mảng và danh sách\nTruy cập các phần tử trong mảng.'],
    [other, 'Transactions.pdf', '# Database transactions\nAtomicity and rollback.'],
  ]) {
    const response = await context.request.post('/api/upload', { multipart: {
      subject_id: String(owner.id), title, file: { name: 'source.txt', mimeType: 'text/plain', buffer: Buffer.from(content) },
    } });
    expect(response.status()).toBe(201);
    documentIds.push((await response.json()).document_id);
  }
  const captures = async name => {
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 900], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: test.info().outputPath(`${name}-${width}.png`), fullPage: true, animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.learning-roadmap-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  };
  await page.goto('/app/roadmap');
  await expect(page.getByText('Bạn chưa có lộ trình học nào', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo lộ trình mới', exact: true }).first().click();
  await page.getByLabel('Môn học', { exact: true }).selectOption(String(subject.id));
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Chọn Transactions.pdf')).toHaveCount(0);
  await page.getByLabel('Chọn C++ Programming.pdf').check();
  await page.getByLabel('Tìm tài liệu').fill('data');
  await expect(page.getByLabel('Chọn C++ Programming.pdf')).toHaveCount(0);
  await page.getByLabel('Chọn Data Structures.pdf').check();
  await page.getByLabel('Tìm tài liệu').fill('');
  await page.getByLabel('Môn học', { exact: true }).selectOption(String(other.id));
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeDisabled();
  await page.getByLabel('Môn học', { exact: true }).selectOption(String(subject.id));
  await page.getByLabel('Chọn C++ Programming.pdf').check();
  await page.getByLabel('Chọn Data Structures.pdf').check();
  await page.getByRole('button', { name: 'Upload tài liệu mới' }).click();
  await expect(page.locator('#upload-subject')).toHaveValue('CPP');
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await captures('step1');
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.locator('.lr-time-summary')).toContainText('= 80');
  await page.getByLabel('Thời gian còn lại', { exact: true }).fill('4');
  await expect(page.locator('.lr-time-summary')).toContainText('= 40');
  await page.getByLabel('Số ngày học mỗi tuần', { exact: true }).fill('8');
  await expect(page.getByRole('button', { name: 'Tạo lộ trình với Nova' })).toBeDisabled();
  await page.getByLabel('Số ngày học mỗi tuần', { exact: true }).fill('5');
  await page.getByLabel('Thời gian còn lại', { exact: true }).fill('8');
  await page.getByLabel('Nắm kiến thức cơ bản', { exact: true }).uncheck();
  await page.getByLabel('Làm project', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Tạo lộ trình với Nova' })).toBeDisabled();
  await page.getByLabel('Nắm kiến thức cơ bản', { exact: true }).check();
  await page.getByLabel('Làm project', { exact: true }).check();
  await page.getByLabel('Chế độ demo — mô phỏng Nova trong vài giây').uncheck();
  await captures('step2');

  let pending;
  let generated;
  let postCount = 0;
  await page.route('**/api/ai-tutor/roadmap', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    postCount++;
    const payload = route.request().postDataJSON();
    expect(Object.keys(payload).sort()).toEqual(['subject', 'goal', 'current_level', 'target_level', 'pace', 'study_time', 'strengths', 'weaknesses', 'topics'].sort());
    expect(payload.subject).toBe('Lập trình C++');
    expect(payload.study_time).toBe(600);
    expect(payload.topics).toEqual(['Biến và kiểu dữ liệu', 'Vòng lặp', 'Mảng và danh sách']);
    expect(payload.goal).toContain('Làm project');
    pending = route;
  });
  await page.clock.install();
  await page.getByRole('button', { name: 'Tạo lộ trình với Nova' }).click();
  await expect.poll(() => postCount).toBe(1);
  await expect(page.getByRole('heading', { name: 'Nova đang xây dựng lộ trình cho bạn...' })).toBeVisible();
  await page.clock.runFor(60000);
  const loading = page.getByRole('progressbar', { name: 'Tiến độ tạo lộ trình' });
  await expect(loading).toHaveAttribute('aria-valuenow', '95');
  await captures('loading');
  await pending.fulfill({ status: 503, json: { error: 'Nova tạm thời bận. Vui lòng thử lại.' } });
  await expect(page.getByRole('alert')).toContainText('Nova tạm thời bận');
  await expect(page.getByLabel('Thời gian còn lại', { exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: 'Tạo lộ trình với Nova' }).click();
  await expect.poll(() => postCount).toBe(2);
  const response = await pending.fetch();
  expect(response.ok()).toBe(true);
  generated = await response.json();
  await pending.fulfill({ response });
  await expect(loading).toHaveAttribute('aria-valuenow', '100');
  await page.clock.runFor(800);
  await expect(page.locator('.lr-study-layout')).toBeVisible();
  await page.clock.resume();
  await captures('roadmap');
  await page.locator('.lr-lesson').nth(1).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu học', exact: true })).toBeDisabled();
  await page.locator('.lr-lesson').first().click();
  await page.getByRole('button', { name: 'Làm Quiz', exact: true }).click();
  const correct = generated.modules[0].lessons[0].objectives[0];
  await page.getByLabel(correct, { exact: true }).check();
  await page.getByRole('button', { name: 'Nộp bài', exact: true }).click();
  await expect(page.locator('.lr-grade')).toContainText('100%');
  await expect(page.getByRole('button', { name: 'Quay lại lộ trình', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Quay lại lộ trình', exact: true }).click();
  await expect(page.locator('.lr-roadmap-card')).toContainText('2 tài liệu');
  await captures('overview');
  await page.reload();
  await expect(page.locator('.lr-roadmap-card')).toContainText('2 tài liệu');
  await expect(page.locator('.lr-roadmap-card')).toContainText('/ 80 giờ');
  await page.getByRole('button', { name: 'Xem tất cả', exact: true }).click();
  await page.getByRole('button', { name: /C\+\+ Programming.pdf.*TXT/ }).click();
  await expect(page.getByRole('heading', { name: 'Biến và kiểu dữ liệu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hoàn tất chủ đề', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Tiến độ tài liệu' })).toHaveAttribute('aria-valuenow', '50');
  await page.getByRole('button', { name: 'Quay lại lộ trình', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Mở Nova AI Tutor', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trò chuyện với Nova' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('nova-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Đóng khung chat', exact: true }).click();
  await page.getByRole('button', { name: 'Mở Nova AI Tutor', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Trò chuyện với Nova' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

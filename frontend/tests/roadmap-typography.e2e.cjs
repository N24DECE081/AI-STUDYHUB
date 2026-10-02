const { test, expect } = require('@playwright/test');

test('roadmap: Study badge, readable rows, wrapping, completion and one Nova launcher', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const registration = await context.request.post('/api/auth/register', { data: {
    first_name: 'Typography', last_name: 'QA', email: `typography-${Date.now()}@studyhub.test`, password: 'StudyHubTest123!',
  } });
  expect(registration.ok()).toBe(true);
  const subjectResponse = await context.request.post('/api/subjects', { data: { code: 'PY', name: 'Python' } });
  expect(subjectResponse.ok()).toBe(true);
  const subject = await subjectResponse.json();
  const longTitle = 'Cú pháp và cách tổ chức chương trình Python với các module và cấu trúc điều khiển';
  const content = [
    '# Hello world', 'Python là một ngôn ngữ lập trình. Bắt đầu bằng câu lệnh print để hiển thị lời chào.',
    `# ${longTitle}`, 'Chia chương trình thành các phần nhỏ để dễ đọc và bảo trì.',
    '# Kết nối cơ sở dữ liệu', 'Tạo kết nối và truy vấn dữ liệu.',
    `# ${'Python'.repeat(16)}`, `Ví dụ tên dài: ${'module'.repeat(60)}`,
  ].join('\n');
  const upload = await context.request.post('/api/upload', { multipart: {
    subject_id: String(subject.id), title: 'Python Rất Là Cơ Bản',
    file: { name: 'python.txt', mimeType: 'text/plain', buffer: Buffer.from(content) },
  } });
  expect(upload.status()).toBe(201);
  await page.route('**/api/ai-tutor/roadmap', route => route.fulfill({ json: {
    roadmap_id: 1, subject: 'StudyHub', modules: [], exercises: [],
  } }));
  await page.goto('/app/roadmap');
  const badge = page.locator('.lr-art-badge');
  await expect(badge).toHaveText('Study');
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [[1920, 1080], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await badge.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`study-logo-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  const launcher = page.getByRole('button', { name: 'Mở Nova AI Tutor', exact: true });
  await expect(launcher).toHaveCount(1);
  await page.getByRole('button', { name: 'Xem tất cả', exact: true }).click();
  await page.getByRole('button', { name: /Python Rất Là Cơ Bản.*TXT/ }).click();
  const rows = page.locator('.lr-source-roadmap .lr-lesson-btn');
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.lr-source-excerpt')).toContainText('Bắt đầu bằng câu lệnh print');
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
  await rows.nth(1).click();
  await expect(page.getByRole('button', { name: 'Hoàn tất chủ đề', exact: true })).toBeDisabled();
  await rows.first().click();
  await page.getByRole('button', { name: 'Hoàn tất chủ đề', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Tiến độ tài liệu' })).toHaveAttribute('aria-valuenow', '25');
  await expect(rows.first().locator('.lr-lesson-status-badge')).toHaveClass(/is-done/);
  await page.evaluate(() => document.fonts.ready);

  for (const [width, height] of [[1920, 1080], [768, 1024], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    await rows.last().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const layout = await rows.evaluateAll(elements => elements.map(el => {
      const bounds = el.getBoundingClientRect();
      const badge = el.querySelector('.lr-lesson-status-badge').getBoundingClientRect();
      const title = el.querySelector('.lr-lesson-btn-text').getBoundingClientRect();
      return {
        display: getComputedStyle(el).display, font: getComputedStyle(el).fontFamily,
        top: bounds.top, bottom: bounds.bottom, height: bounds.height,
        titleGap: title.left - badge.right, overflow: el.scrollWidth > el.clientWidth,
      };
    }));
    layout.forEach((row, index) => {
      expect(row.display).toBe('flex');
      expect(row.font).toContain('Nunito Sans');
      expect(row.height).toBeGreaterThanOrEqual(52);
      expect(row.titleGap).toBeGreaterThanOrEqual(10);
      expect(row.overflow).toBe(false);
      if (index) expect(row.top - layout[index - 1].bottom).toBeGreaterThanOrEqual(9);
    });
    expect(await page.locator('.lr-source-roadmap').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await launcher.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.width === 156 && box.height === 52 && [...el.querySelectorAll('strong, small')].every(text => {
        const range = document.createRange();
        range.selectNodeContents(text);
        const rect = range.getBoundingClientRect();
        return rect.left >= box.left && rect.right <= box.right && rect.bottom <= box.bottom;
      });
    })).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath(`source-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await launcher.click();
  const chat = page.getByRole('dialog', { name: 'Trò chuyện với Nova' });
  await expect(chat).toBeVisible();
  expect(await chat.evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath('nova-mobile.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(chat).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('generated roadmap keeps five distinct topics instead of twenty repeated parts', async ({ page, context }) => {
  const registration = await context.request.post('/api/auth/register', { data: {
    first_name: 'Compact', last_name: 'QA', email: `compact-${Date.now()}@studyhub.test`, password: 'StudyHubTest123!',
  } });
  expect(registration.ok()).toBe(true);
  const subject = await (await context.request.post('/api/subjects', { data: { code: 'OS', name: 'Hệ điều hành' } })).json();
  const topics = ['Tiến trình', 'Luồng', 'Semaphore', 'Vùng găng', 'Đồng bộ hóa'];
  const upload = await context.request.post('/api/upload', { multipart: {
    subject_id: String(subject.id), title: 'Đồng bộ luồng', file: {
      name: 'threads.txt', mimeType: 'text/plain',
      buffer: Buffer.from(topics.map(topic => `# ${topic}\nNội dung và ví dụ của ${topic}.`).join('\n')),
    },
  } });
  expect(upload.status()).toBe(201);
  await page.goto('/app/roadmap');
  await expect(page.getByRole('button', { name: 'Xem tất cả', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo lộ trình mới', exact: true }).first().click();
  await page.getByLabel('Môn học', { exact: true }).selectOption(String(subject.id));
  await page.getByLabel('Chọn Đồng bộ luồng', { exact: true }).check();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.getByLabel('Chế độ demo — mô phỏng Nova trong vài giây').uncheck();
  const generated = page.waitForResponse(response => response.url().endsWith('/api/ai-tutor/roadmap') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Tạo lộ trình với Nova', exact: true }).click();
  const response = await generated;
  expect(response.status()).toBe(201);
  const roadmap = await response.json();
  expect(roadmap.modules.flatMap(module => module.lessons.map(lesson => lesson.title))).toEqual(topics);
  const rows = page.locator('.lr-study-view .lr-lesson-btn');
  await expect(rows).toHaveCount(5);
  await expect(page.locator('.lr-lesson-detail-title')).toHaveText(topics[0]);
  await page.getByRole('button', { name: 'Làm Quiz', exact: true }).click();
  await page.getByLabel(roadmap.modules[0].lessons[0].objectives[0], { exact: true }).check();
  await page.getByRole('button', { name: 'Nộp bài', exact: true }).click();
  await expect(page.locator('.lr-grade-report')).toContainText('100');
  await rows.nth(1).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu học', exact: true })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Tiếp tục học', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [[1920, 1080], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`compact-roadmap-${width}.png`), fullPage: true, animations: 'disabled' });
  }
});

const { test, expect } = require('@playwright/test');

test('load only the active module; preserve navigation, images and Focus Space state', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const scripts = new Set();
  page.on('request', request => {
    if (request.resourceType() === 'script') scripts.add(new URL(request.url()).pathname);
  });
  const loaded = name => [...scripts].some(path => path.endsWith(`/${name}.jsx`));
  const account = await context.request.post('/api/auth/register', { data: {
    first_name: 'Lazy', last_name: 'QA', email: `lazy-${Date.now()}@studyhub.test`, password: 'LazyTest123!'
  } });
  expect(account.status()).toBe(201);
  await page.goto('/app/plans');
  await expect(page.locator('.price-grid .price-card')).toHaveCount(3);
  for (const name of ['AITutorPage', 'QuizCardPage', 'LearningRoadmapPage', 'FocusSpacePage', 'PaymentCheckout', 'FlashcardDeckForm', 'StudyDeckSession']) {
    expect(loaded(name), name + ' must not load on Plans').toBe(false);
  }
  await page.locator('.nav-item').filter({ hasText: 'Quiz Card' }).click();
  await expect(page.locator('.qc-page')).toBeVisible();
  expect(loaded('QuizCardPage')).toBe(true);
  expect(loaded('QuizWorkspace')).toBe(false);
  expect(loaded('LearningCreateModal')).toBe(false);
  await page.getByRole('button', { name: 'Tạo bộ Flashcard', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(loaded('LearningCreateModal')).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng hộp thoại', exact: true }).click();
  await page.locator('.nav-item').filter({ hasText: 'AI Tutor' }).click();
  await expect(page.locator('.tutor-input-shell textarea')).toBeEnabled();
  expect(loaded('AITutorPage')).toBe(true);
  expect(loaded('AITutorJourney')).toBe(false);
  expect(loaded('AITutorExercise')).toBe(false);
  await page.locator('.brand-wrap').click();
  await expect(page.locator('.hero-section')).toBeVisible();
  await expect(page.locator('.logo-artwork')).toHaveAttribute('loading', 'eager');
  await expect(page.locator('.logo-artwork')).toHaveAttribute('fetchpriority', 'high');
  expect(loaded('FocusSpacePage')).toBe(false);
  await page.getByRole('button', { name: 'Mở Không gian học tập', exact: true }).click();
  await expect(page.locator('.focus-space-page')).toBeVisible();
  expect(loaded('FocusSpacePage')).toBe(true);
  await page.getByRole('button', { name: '25 min', exact: true }).click();
  await expect(page.locator('.focus-space-preview__stats')).toContainText('25 min');
  await page.getByRole('button', { name: 'Về StudyHub', exact: true }).click();
  await page.getByRole('button', { name: 'Mở Không gian học tập', exact: true }).click();
  await expect(page.locator('.focus-space-preview__stats')).toContainText('25 min');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await expect(page.locator('.focus-space-page')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  expect(await page.locator('img').evaluateAll(images => images.every(image => image.decoding === 'async'))).toBe(true);
  expect(errors).toEqual([]);
});

test('lazy authoring and study modules keep manual flashcards and quizzes usable', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await context.request.post('/api/auth/register', { data: {
    first_name: 'Lazy', last_name: 'Author', email: `lazy-author-${Date.now()}@studyhub.test`, password: 'LazyTest123!'
  } });
  const subject = await (await context.request.post('/api/subjects', { data: { code: 'LAZY', name: 'Lazy QA' } })).json();
  for (const kind of ['flashcard', 'quiz']) {
    const flash = kind === 'flashcard';
    await page.goto('/app/quiz');
    await page.getByRole('button', { name: flash ? 'Tạo bộ Flashcard' : 'Tạo bài trắc nghiệm', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Thủ công', exact: true }).click();
    await dialog.getByLabel('Môn học', { exact: true }).selectOption(String(subject.id));
    await dialog.getByLabel(flash ? 'Tên bộ Flashcard' : 'Tên bài trắc nghiệm', { exact: true }).fill(`Lazy ${kind}`);
    if (flash) {
      await dialog.getByLabel('Mặt trước', { exact: true }).fill('Lazy question');
      await dialog.getByLabel('Mặt sau', { exact: true }).fill('Lazy answer');
    } else {
      await dialog.getByLabel('Câu hỏi', { exact: true }).fill('2 + 2 = ?');
      for (const [index, answer] of ['1', '2', '3', '4'].entries()) {
        await dialog.getByLabel(`Đáp án ${'ABCD'[index]}`, { exact: true }).fill(answer);
      }
      await dialog.getByLabel('Chọn D là đáp án đúng').check();
    }
    await dialog.getByRole('button', { name: flash ? 'Lưu bộ Flashcard' : 'Lưu bài trắc nghiệm' }).click();
    if (flash) {
      await expect(page.getByText('Lazy question', { exact: true })).toBeVisible();
    } else {
      await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/1');
      await page.locator('.quiz-option').nth(3).click();
      await page.getByRole('button', { name: 'Hoàn thành bài', exact: true }).click();
      await expect(page.locator('.qc-finished')).toContainText('1 / 1');
    }
    await page.goto('/app/quiz');
    await expect(page.getByRole('heading', { name: `Lazy ${kind}`, exact: true })).toBeVisible();
  }
});

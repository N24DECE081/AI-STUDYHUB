const { test, expect } = require('@playwright/test');

test('cookie validation, guest content, login, empty member, logout and reload', async ({ page, context }) => {
  const email = `home-auth-${Date.now()}@studyhub.test`;
  const password = 'StudyHubTest123!';
  const response = await context.request.post('/api/auth/register', { data: {
    first_name: 'Home', last_name: 'Member', email, password,
  } });
  expect(response.ok()).toBe(true);
  await context.request.post('/api/auth/logout');
  await page.addInitScript(() => localStorage.setItem('studyhub-user', JSON.stringify({ id: 'stale', name: 'Other account' })));
  let release;
  const session = new Promise(resolve => { release = resolve; });
  await page.route('**/api/me', async route => { await session; await route.continue(); });
  await page.goto('/dashboard');
  await expect(page.locator('.home-page--loading')).toBeVisible();
  await expect(page.locator('.home-page--guest, .home-page--member:not(.home-page--loading)')).toHaveCount(0);
  await expect(page.locator('.home-page--loading > section')).toHaveCount(2);
  await expect(page.getByText('Other account')).toHaveCount(0);
  release();
  await expect(page.locator('.home-page--guest')).toBeVisible();
  for (const selector of ['.pain-points-section', '.workflow-section', '.roadmap-sample-section', '.streak-habit-section', '.landing-tutor', '.landing-pricing', '.landing-faq', '.landing-final']) {
    await expect(page.locator(selector)).toHaveCount(1);
  }
  await expect(page.locator('.auth-box').getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await expect(page.locator('.auth-box').getByRole('button', { name: 'Đăng ký', exact: true })).toBeVisible();
  await expect(page.locator('.user-pill, .streak-pill')).toHaveCount(0);
  expect(await page.locator('.hero-note').allTextContents()).toEqual([
    'Gọn một nơiTài liệu & kiến thức', 'Rõ từng bướcLộ trình của riêng bạn', 'Mỗi ngày một chútXây thói quen học',
  ]);
  expect(await page.locator('.home-page section').evaluateAll(sections => sections.every(section => document.getElementById(section.getAttribute('aria-labelledby'))))).toBe(true);
  for (const width of [1920, 1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`guest-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ sáng' }).click();
    }
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator('.hero-actions').getByRole('button', { name: 'Hỏi Nova AI Tutor' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('.studyhub-auth__submit').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('.home-page--member')).toBeVisible();
  await expect(page.locator('.home-page > section')).toHaveCount(2);
  await expect(page.locator('.pain-points-section, .workflow-section, .roadmap-sample-section, .landing-tutor, .landing-pricing, .landing-faq, .landing-final')).toHaveCount(0);
  expect(await page.locator('.hero-note strong').allTextContents()).toEqual(['0 tài liệu', '0%', '0 ngày']);
  await expect(page.locator('.streak-card .streak-day')).toHaveCount(7);
  await expect(page.locator('.streak-card .is-active')).toHaveCount(0);
  await expect(page.locator('.streak-card [aria-current="date"]')).toHaveCount(1);
  expect(await page.locator('.streak-card .streak-day i').allTextContents()).toEqual(Array(7).fill('·'));
  await expect(page.locator('.streak-card-footer')).toContainText('GMT+7');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const subject = await (await context.request.post('/api/subjects', { data: { code: 'HOME', name: 'Home QA' } })).json();
  const upload = await context.request.post('/api/upload', { multipart: {
    subject_id: String(subject.id), title: 'Home source',
    file: { name: 'home.txt', mimeType: 'text/plain', buffer: Buffer.from('StudyHub keeps learning material in one place.') },
  } });
  expect(upload.status()).toBe(201);
  const quiz = await (await context.request.post('/api/quizzes/manual', { data: {
    subject_id: subject.id, title: 'Home quiz',
    questions: [{ question: '2 + 2 = ?', options: ['1', '2', '3', '4'], correct_index: 3 }],
  } })).json();
  expect((await context.request.post(`/api/quizzes/${quiz.id}/submit`, { data: { answers: { q1: 3 } } })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
  await page.reload();
  await expect(page.locator('.home-page--member')).toBeVisible();
  await expect(page.locator('.hero-note--one strong')).toHaveText('1 tài liệu');
  await expect(page.locator('.hero-note--two strong')).toHaveText('100%');
  await expect(page.locator('.hero-note--three strong')).toHaveText('1 ngày');
  await expect(page.locator('.streak-card [aria-current="date"]')).toHaveClass(/is-active/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.locator('.home-page--guest')).toBeVisible();
  await expect(page.locator('.streak-card, .user-pill, .streak-pill')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key === 'studyhub-user' || key.startsWith('studyhub-subscription:') || key.startsWith('studyhub-quiz-decks:')))).toEqual([]);
  await page.reload();
  await expect(page.locator('.home-page--guest')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Bật chế độ sáng' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('history calendar, today, member spacing and contrast at all five widths', async ({ page, context }) => {
  test.setTimeout(120000);
  await context.request.post('/api/auth/register', { data: {
    first_name: 'Streak', last_name: 'QA', email: `home-streak-${Date.now()}@studyhub.test`, password: 'StudyHubTest123!',
  } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/streak', route => route.fulfill({ json: {
    current_streak: 3, today: '2026-10-03', timezone: 'GMT+7',
    activity_dates: ['2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03'],
  } }));
  await page.goto('/dashboard');
  await expect(page.locator('.hero-note--three strong')).toHaveText('3 ngày');
  expect(await page.locator('.streak-card .streak-day > span:first-child').allTextContents()).toEqual(['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']);
  expect(await page.locator('.streak-card .streak-day > strong').allTextContents()).toEqual(['27', '28', '29', '30', '1', '2', '3']);
  await expect(page.locator('.streak-card .is-active')).toHaveCount(4);
  await expect(page.locator('.streak-card [aria-current="date"]')).toHaveAttribute('aria-label', /3 tháng 10, đã học/);
  await expect(page.locator('.streak-card .streak-day').first()).toHaveAttribute('aria-label', /27 tháng 9, chưa học/);
  for (const width of [1920, 1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
      await page.evaluate(() => document.fonts.ready);
      // Theme tokens transition; wait until the day surface matches the token.
      await expect.poll(() => page.locator('.streak-day.is-active').first().evaluate(el => {
        const probe = document.createElement('span'); probe.style.background = 'var(--mint-soft)'; document.body.append(probe);
        const settled = getComputedStyle(probe).backgroundColor === getComputedStyle(el).backgroundColor; probe.remove(); return settled;
      })).toBe(true);
      const result = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const hero = rect('.hero-section'), section = rect('.streak-habit-section');
        const days = [...document.querySelectorAll('.streak-card .streak-day')].map(el => el.getBoundingClientRect());
        const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
          v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
        }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const contrast = [...document.querySelectorAll('.streak-card .streak-day :is(span, strong, i), .streak-card-footer, .streak-title-group h3, .streak-title-group .eyebrow, .streak-description, .streak-habit-section > :is(.eyebrow, h2, p)')].map(el => {
          let surface = el;
          while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
          const fg = luminance(getComputedStyle(el).color), bg = luminance(getComputedStyle(surface).backgroundColor);
          return { text: el.textContent, ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
        });
        return { overflow: document.documentElement.scrollWidth > innerWidth, gap: section.top - hero.bottom,
          badgeOverlapsTitle: intersects(rect('.streak-title-group .eyebrow'), rect('.streak-title-group h3')),
          badgeOverlapsIcon: intersects(rect('.streak-title-group .eyebrow'), rect('.streak-symbol')),
          dayOverflow: days.some(day => day.left < section.left || day.right > section.right),
          oneRow: days.every(day => day.top === days[0].top), contrast };
      });
      expect(result.overflow).toBe(false);
      expect(result.gap).toBeGreaterThanOrEqual(48); expect(result.gap).toBeLessThanOrEqual(64);
      expect(result.badgeOverlapsTitle).toBe(false); expect(result.badgeOverlapsIcon).toBe(false);
      expect(result.dayOverflow).toBe(false); expect(result.oneRow).toBe(true);
      result.contrast.forEach(item => expect(item.ratio, `${width} ${theme}: ${item.text}`).toBeGreaterThanOrEqual(4.5));
      await page.screenshot({ path: test.info().outputPath(`member-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ sáng' }).click();
    }
  }
});

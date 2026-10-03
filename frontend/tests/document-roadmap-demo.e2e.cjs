const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('document roadmap demo: shared upload, schedule, timeline, completion, quiz, persistence and themes', async ({ page, context, browser }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const registration = await context.request.post('/api/auth/register', { data: {
    first_name: 'Document', last_name: 'Demo', email: `document-demo-${Date.now()}@studyhub.test`, password: 'StudyHubTest123!',
  } });
  expect(registration.ok()).toBe(true);
  const subject = await (await context.request.post('/api/subjects', { data: { code: 'CPP', name: 'Lập trình C++' } })).json();
  for (const [title, content] of [
    ['C++ Programming.pdf', '# C++ Fundamentals\nBiến, kiểu dữ liệu và vòng lặp.'],
    ['Data Structures.docx', '# Functions & Arrays\nHàm, tham số và thao tác với mảng.'],
  ]) {
    const upload = await context.request.post('/api/upload', { multipart: {
      subject_id: String(subject.id), title, file: { name: 'source.md', mimeType: 'text/markdown', buffer: Buffer.from(content) },
    } });
    expect(upload.status()).toBe(201);
  }
  let novaRequests = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/ai-tutor/roadmap') && request.method() === 'POST') novaRequests++;
  });
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await page.goto('/app/roadmap');
  await expect(page.getByRole('heading', { name: 'Bạn chưa có lộ trình học nào' })).toBeVisible();
  await expect(page.locator('.lr-document-header .roadmap-logo img')).toHaveAttribute('loading', 'eager');
  await expect(page.locator('.lr-empty-card .roadmap-logo img')).toHaveAttribute('loading', 'lazy');
  const logo = page.locator('.lr-empty-card .roadmap-logo');
  await expect(logo.locator('img')).toHaveJSProperty('naturalWidth', 1254);
  const geometry = await logo.evaluate(el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el), image = el.querySelector('img');
    return { ratio: r.width / r.height, radius: s.borderRadius, overflow: s.overflow,
      perspective: s.perspective, alt: image.alt, fit: getComputedStyle(image).objectFit };
  });
  expect(geometry).toEqual({ ratio: 1, radius: '24px', overflow: 'hidden', perspective: '800px', alt: 'Lộ trình học', fit: 'contain' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await logo.hover();
  expect(await logo.locator('.roadmap-logo-art').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await logo.locator('.roadmap-logo-stage').evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await logo.hover({ position: { x: 180, y: 30 } });
  await expect.poll(() => logo.evaluate(el => parseFloat(el.style.getPropertyValue('--roadmap-ry')))).toBeGreaterThan(0);
  const tilt = await logo.evaluate(el => ({
    x: parseFloat(el.style.getPropertyValue('--roadmap-rx')), y: parseFloat(el.style.getPropertyValue('--roadmap-ry')),
    shadow: parseFloat(el.style.getPropertyValue('--roadmap-shadow-x')),
    depths: ['.roadmap-logo-rings', '.roadmap-logo-art', '.roadmap-logo-particles'].map(selector => getComputedStyle(el.querySelector(selector)).transform),
  }));
  expect(Math.abs(tilt.x)).toBeLessThanOrEqual(12);
  expect(Math.abs(tilt.y)).toBeLessThanOrEqual(12);
  expect(tilt.shadow).toBeLessThan(0);
  expect(new Set(tilt.depths).size).toBe(3);
  await page.mouse.move(0, 0);
  await expect.poll(() => logo.evaluate(el => el.style.getPropertyValue('--roadmap-ry'))).toBe('0deg');
  await page.setViewportSize({ width: 390, height: 844 });
  await logo.hover();
  expect(await logo.locator('.roadmap-logo-stage').evaluate(el => getComputedStyle(el).transform)).toBe('none');
  expect(await logo.locator('.roadmap-logo-art').evaluate(el => getComputedStyle(el).animationName)).toBe('roadmap-logo-float-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.mouse.move(0, 0);
  const touch = await browser.newContext({ hasTouch: true, viewport: { width: 1024, height: 900 } });
  await touch.addCookies(await context.cookies());
  const tablet = await touch.newPage();
  await tablet.goto('http://127.0.0.1:5183/app/roadmap');
  await expect(tablet.locator('.lr-empty-card .roadmap-logo')).toBeVisible();
  await tablet.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 40, gamma: 0 }));
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 50, gamma: 10 }));
  });
  await expect.poll(() => tablet.locator('.lr-empty-card .roadmap-logo').evaluate(el => parseFloat(el.style.getPropertyValue('--roadmap-ry')))).toBeGreaterThan(0);
  await touch.close();
  await capture('empty-desktop');
  await page.getByRole('button', { name: 'Tạo lộ trình mới', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Upload tài liệu mới' }).click();
  const uploadDialog = page.getByRole('dialog', { name: 'Thêm tài liệu vào Kho học liệu' });
  await expect(uploadDialog.locator('#upload-subject')).toHaveValue('CPP');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('upload-mobile');
  await uploadDialog.locator('#upload-title').fill('Algorithms.md');
  await uploadDialog.locator('#upload-file').setInputFiles({ name: 'Algorithms.md', mimeType: 'text/markdown', buffer: Buffer.from('# Linked List & Tree\nDanh sách liên kết và cây.\n# Algorithms\nTìm kiếm và sắp xếp.') });
  await uploadDialog.getByRole('button', { name: 'Tải lên & Xử lý' }).click();
  await expect(uploadDialog).not.toBeVisible();
  await expect(page.getByText('Tài liệu đã được thêm vào Kho học liệu', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Sử dụng tài liệu này để tạo lộ trình')).toBeChecked();
  await expect(page.getByLabel('Chọn Algorithms.md')).toBeChecked();
  const library = await (await context.request.get('/api/documents')).json();
  expect((Array.isArray(library) ? library : library.items || library.documents).some(doc => doc.title === 'Algorithms.md')).toBe(true);
  await page.getByLabel('Chọn C++ Programming.pdf').check();
  await page.getByLabel('Chọn Data Structures.docx').check();
  await capture('selection-mobile');
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.locator('.lr-time-summary')).toContainText('= 80');
  await page.getByLabel('Thời gian còn lại', { exact: true }).fill('3');
  await page.getByLabel('Thời gian học mỗi ngày', { exact: true }).fill('0.5');
  await expect(page.locator('.lr-time-summary')).toContainText('= 7.5');
  await page.getByLabel('Thời gian còn lại', { exact: true }).fill('8');
  await page.getByLabel('Thời gian học mỗi ngày', { exact: true }).fill('2');
  await page.getByLabel('Số ngày học mỗi tuần', { exact: true }).fill('8');
  await expect(page.getByRole('button', { name: 'Tạo lộ trình với Nova', exact: true })).toBeDisabled();
  await page.getByLabel('Số ngày học mỗi tuần', { exact: true }).fill('5');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture('goals-desktop');
  await page.getByRole('button', { name: 'Tạo lộ trình với Nova', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nova đang xây dựng lộ trình cho bạn...' })).toBeVisible();
  await expect(page.locator('.lr-nova-loading-view .roadmap-logo img')).toBeVisible();
  expect(await page.locator('.lr-loading-logo').evaluate(el => el.getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom)).toBe(true);
  await capture('nova-loading');
  const topics = page.locator('.lr-timeline .lr-lesson');
  await expect(topics).toHaveCount(4);
  await expect(page.getByRole('progressbar', { name: 'Tiến độ lộ trình', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await expect(topics.first()).toContainText('0 – 20 giờ');
  await expect(topics.first()).toContainText('C++ Programming.pdf');
  await capture('timeline-desktop');
  await topics.nth(1).click();
  await expect(page.getByRole('button', { name: 'Đánh dấu hoàn thành' })).toBeDisabled();
  await topics.first().click();
  await page.getByRole('button', { name: 'Đánh dấu hoàn thành' }).click();
  await expect(page.getByRole('progressbar', { name: 'Tiến độ lộ trình', exact: true })).toHaveAttribute('aria-valuenow', '25');
  await expect(topics.nth(1)).toContainText('Đang học');
  await topics.nth(1).click();
  await page.getByRole('button', { name: 'Làm Quiz', exact: true }).click();
  await page.locator('.lr-quiz-choices input').first().check();
  await page.getByRole('button', { name: 'Nộp bài', exact: true }).click();
  await expect(page.locator('.lr-grade')).toContainText('100%');
  await expect(page.getByRole('progressbar', { name: 'Tiến độ lộ trình', exact: true })).toHaveAttribute('aria-valuenow', '50');
  await page.reload();
  await expect(page.locator('.lr-roadmap-card')).toContainText('40 / 80 giờ');
  await expect(page.locator('.lr-roadmap-card')).toContainText('2 / 4 chủ đề');
  await expect(page.locator('.lr-roadmap-card .roadmap-logo img')).toBeVisible();
  await expect(page.locator('.lr-roadmap-card')).not.toContainText('Study');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture('logo-card-light-' + width);
    await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
    await capture('logo-card-dark-' + width);
    const ratios = await page.evaluate(() => {
      const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
        v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const base = getComputedStyle(document.body).backgroundColor;
      return [...document.querySelectorAll('.lr-document-header h1, .lr-document-header p, .lr-hero-title, .lr-hero-subtitle, .lr-btn-primary')].map(el => {
        const s = getComputedStyle(el), fg = luminance(s.color), bg = luminance(el.matches('.lr-btn-primary') ? s.backgroundColor : base);
        return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      });
    });
    ratios.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));
    await page.getByRole('button', { name: 'Bật chế độ sáng' }).click();
  }
  await page.getByRole('button', { name: 'Tiếp tục học', exact: true }).click();
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    await capture(`timeline-light-${width}`);
    const light = await topics.first().evaluate(el => getComputedStyle(el).backgroundColor);
    await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
    await expect.poll(() => topics.first().evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(light);
    await capture(`timeline-dark-${width}`);
    await page.getByRole('button', { name: 'Bật chế độ sáng' }).click();
  }
  await topics.nth(2).click();
  await page.getByRole('button', { name: 'Đánh dấu hoàn thành' }).click();
  await topics.nth(3).click();
  await page.getByRole('button', { name: 'Đánh dấu hoàn thành' }).click();
  await expect(page.getByRole('progressbar', { name: 'Tiến độ lộ trình', exact: true })).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('button', { name: 'Quay lại lộ trình', exact: true }).click();
  await expect(page.locator('.lr-roadmap-card')).toContainText('Còn khoảng 0 giờ');
  await expect(page.locator('.lr-roadmap-card .lr-status-pill')).toContainText('HOÀN THÀNH');
  expect(novaRequests).toBe(0);
  expect(errors).toEqual([]);
  const logoCSS = readFileSync(join(__dirname, '../src/components/RoadmapLogo.css'), 'utf8');
  expect(logoCSS).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|hue-rotate/i);
});

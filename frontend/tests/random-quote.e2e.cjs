const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('useRandomQuote unit: hook state, empty/single lists and non-repeating complete cycles', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const { checkRandomQuote } = await import('/tests/useRandomQuote.unit.ts');
    return checkRandomQuote();
  });
  for (const { quotes, values, rendered } of results) {
    expect(rendered).toEqual(values);
    if (!quotes.length) { expect(values.every(value => value === null)).toBe(true); continue; }
    if (quotes.length === 1) { expect(values.every(value => value === quotes[0])).toBe(true); continue; }
    values.forEach((value, i) => { if (i) expect(value).not.toBe(values[i - 1]); });
    for (let i = 0; i < values.length; i += quotes.length) {
      expect(values.slice(i, i + quotes.length).sort()).toEqual([...quotes].sort());
    }
  }
  const quotes = results.at(-1).quotes;
  expect(quotes.length).toBeGreaterThanOrEqual(20);
  expect(quotes.every(quote => quote.length < 120 && !/\uFFFD/.test(quote))).toBe(true);
});

test('SH quote: ten clicks, drag threshold, timer reset, copy, keyboard, bounds and themes', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const registration = await context.request.post('/api/auth/register', { data: {
    first_name: 'Quote', last_name: 'Test', email: 'quote-' + Date.now() + '@studyhub.test', password: 'StudyHubTest123!',
  } });
  expect(registration.ok()).toBe(true);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/dashboard');
  await page.evaluate(() => document.fonts.ready);
  await page.clock.install();
  const logo = page.getByRole('button', { name: 'Nhận câu động lực', exact: true });
  const bubble = page.locator('.quote-bubble');
  await expect(logo).toHaveAttribute('title', 'Nhấn để nhận động lực');
  const bounds = await logo.boundingBox();
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  await page.mouse.move(x, y);
  await page.mouse.up();
  await expect(bubble).toHaveCount(0);
  const seen = [];
  for (let i = 0; i < 10; i++) {
    await logo.click();
    await expect(bubble).toHaveCount(1);
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('p')).toHaveCount(1);
    const text = await bubble.locator('p').innerText();
    expect(seen).not.toContain(text);
    seen.push(text);
  }
  await expect(logo).not.toHaveAttribute('title');
  await expect(page.getByRole('button', { name: 'Câu khác', exact: true })).toHaveCount(0);
  await page.clock.fastForward(5500);
  await expect(bubble.locator('p')).toHaveText(seen.at(-1));
  await logo.click();
  await page.clock.fastForward(1500);
  await expect(logo).toHaveAttribute('aria-expanded', 'true');
  await page.clock.fastForward(4500);
  await expect(logo).toHaveAttribute('aria-expanded', 'false');
  await logo.focus();
  await page.keyboard.press('Enter');
  const keyboardQuote = await bubble.locator('p').innerText();
  await page.keyboard.press('ArrowRight');
  expect(await logo.evaluate(el => el.style.getPropertyValue('--rotate-y'))).toBe('30deg');
  await expect(bubble.locator('p')).toHaveText(keyboardQuote);
  await page.keyboard.press('Escape');
  await expect(logo).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(bubble).toBeVisible();
  const copied = await bubble.locator('p').innerText();
  await bubble.getByRole('button', { name: 'Sao chép câu động lực' }).click();
  await expect(page.locator('.toast')).toHaveText('Đã sao chép');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(copied);
  await page.locator('.hero-copy h1').click();
  await expect(logo).toHaveAttribute('aria-expanded', 'false');
  await logo.click();
  await page.locator('.logo-3d-orbit').click({ position: { x: 4, y: 140 } });
  await expect(logo).toHaveAttribute('aria-expanded', 'false');
  await logo.click();
  await page.mouse.wheel(0, 200);
  await expect(logo).toHaveAttribute('aria-expanded', 'false');
  await page.clock.runFor(500);
  await page.clock.resume();

  for (const width of [1920, 1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await logo.click();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.getByRole('button', { name: 'Bật chế độ tối' }).evaluate(el => el.focus({ preventScroll: true }));
        await page.keyboard.press('Space');
      }
      await expect(bubble).toBeVisible();
      await expect.poll(() => bubble.evaluate(el => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--text-dark)';
        probe.style.backgroundColor = 'var(--bg-alt)';
        document.body.append(probe);
        const actual = getComputedStyle(el), expected = getComputedStyle(probe);
        const settled = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor;
        probe.remove();
        return settled;
      })).toBe(true);
      const layout = await bubble.evaluate(el => {
        const r = el.getBoundingClientRect(), hero = el.closest('.hero-section').getBoundingClientRect();
        const copy = el.closest('.hero-section').querySelector('.hero-copy').getBoundingClientRect();
        const text = el.querySelector('p'), style = getComputedStyle(el);
        const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
          v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
        }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const fg = luminance(style.color), bg = luminance(style.backgroundColor);
        return { inside: r.left >= hero.left + 7 && r.right <= hero.right - 7 && r.top >= hero.top + 7 && r.bottom <= hero.bottom - 7,
          copyOverlap: r.left < copy.right && r.right > copy.left && r.top < copy.bottom && r.bottom > copy.top,
          belowHeader: r.top >= document.querySelector('.topbar').getBoundingClientRect().bottom,
          lines: text.offsetHeight / parseFloat(getComputedStyle(text).lineHeight),
          contrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05),
          tailColor: getComputedStyle(el, '::after').backgroundColor, color: style.backgroundColor,
          placement: el.parentElement.dataset.quotePlacement,
        };
      });
      expect(layout.inside).toBe(true);
      expect(layout.copyOverlap).toBe(false);
      expect(layout.belowHeader).toBe(true);
      expect(layout.lines).toBeLessThanOrEqual(4);
      expect(layout.contrast).toBeGreaterThanOrEqual(4.5);
      expect(layout.tailColor).toBe(layout.color);
      if (width === 390) expect(layout.placement).toBe('below');
      await page.screenshot({ path: test.info().outputPath('quote-' + theme + '-' + width + '.png'), animations: 'disabled' });
      if (theme === 'dark') {
        await page.getByRole('button', { name: 'Bật chế độ sáng' }).evaluate(el => el.focus({ preventScroll: true }));
        await page.keyboard.press('Space');
      }
    }
    await page.keyboard.press('Escape');
  }
  await logo.focus();
  await page.keyboard.press('Enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await bubble.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  expect(await page.locator('.logo-artwork').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /quote|motivation/i.test(key)))).toBe(false);
  const css = readFileSync(join(__dirname, '../src/components/QuoteBubble.css'), 'utf8');
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  expect(errors).toEqual([]);
});

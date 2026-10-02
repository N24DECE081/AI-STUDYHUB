const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('homepage: centered pill, aligned hero, Vietnamese copy and contrast in both themes', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const registration = await context.request.post('/api/auth/register', { data: {
    first_name: 'Nguyễn Minh', last_name: 'Phương Thảo', email: 'home-' + Date.now() + '@studyhub.test', password: 'StudyHubTest123!',
  } });
  expect(registration.ok()).toBe(true);
  await page.goto('/dashboard');
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(page.locator('.hero-section')).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Trang chủ', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Học nhiều nhưng không nhớ', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  expect(await page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]').getAttribute('href')).toContain('subset=vietnamese');
  for (const width of [1920, 1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
      await page.evaluate(() => { scrollTo(0, 0); return document.fonts.ready; });
      await page.screenshot({ path: test.info().outputPath('home-' + theme + '-' + width + '.png'), fullPage: true, animations: 'disabled' });
      const layout = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const hero = rect('.hero-section'), section = rect('.pain-points-section'), nav = rect('.nav-menu');
        const notes = [...document.querySelectorAll('.hero-note')].map(el => el.getBoundingClientRect());
        const heading = getComputedStyle(document.querySelector('.hero-copy h1'));
        const navStyle = getComputedStyle(document.querySelector('.nav-menu'));
        const heroStyle = getComputedStyle(document.querySelector('.hero-section'));
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          navCenterError: Math.abs(nav.left + nav.width / 2 - innerWidth / 2),
          navOverlap: intersects(nav, rect('.topbar > .brand-wrap')) || intersects(nav, rect('.auth-box')),
          navRadius: parseFloat(navStyle.borderRadius), navBorder: navStyle.borderTopWidth,
          sticky: getComputedStyle(document.querySelector('.topbar')).position,
          tabHeights: [...document.querySelectorAll('.nav-item')].map(el => el.getBoundingClientRect().height),
          tabWrap: [...document.querySelectorAll('.nav-item')].some(el => getComputedStyle(el).whiteSpace !== 'nowrap'),
          heroAlign: Math.abs(hero.left - section.left) + Math.abs(hero.width - section.width),
          heroRadius: parseFloat(heroStyle.borderRadius), heroOverflow: heroStyle.overflow,
          heroMinHeight: parseFloat(heroStyle.minHeight), headingLineHeight: parseFloat(heading.lineHeight) / parseFloat(heading.fontSize),
          noteOutside: notes.some(n => n.left < hero.left || n.right > hero.right || n.top < hero.top || n.bottom > hero.bottom),
          noteOverlapsCopy: notes.some(note => intersects(note, rect('.hero-copy'))),
          noteOverlapsNote: notes.some((note, i) => notes.slice(i + 1).some(other => intersects(note, other))),
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.navCenterError).toBeLessThanOrEqual(1);
      expect(layout.navOverlap).toBe(false);
      expect(layout.navRadius).toBeGreaterThanOrEqual(999);
      expect(layout.navBorder).toBe('1px');
      expect(layout.sticky).toBe('sticky');
      expect(Math.max(...layout.tabHeights) - Math.min(...layout.tabHeights)).toBeLessThanOrEqual(1);
      expect(layout.tabWrap).toBe(false);
      expect(layout.heroAlign).toBeLessThanOrEqual(1);
      expect(layout.heroRadius).toBeGreaterThanOrEqual(24);
      expect(layout.heroOverflow).toBe('hidden');
      expect(layout.heroMinHeight).toBeGreaterThanOrEqual(480);
      expect(layout.headingLineHeight).toBeGreaterThanOrEqual(1.15);
      expect(layout.noteOutside).toBe(false);
      expect(layout.noteOverlapsCopy).toBe(false);
      expect(layout.noteOverlapsNote).toBe(false);
      // Bound contrast against the actual translucent gradient stops over the card surface.
      const contrast = await page.evaluate(() => {
        const color = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = rgb => rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const root = getComputedStyle(document.documentElement);
        const [base, mint, pink] = ['--bg-main', '--mint-soft', '--pink-soft'].map(name => {
          const el = document.createElement('span'); el.style.color = root.getPropertyValue(name); document.body.append(el);
          const rgb = color(getComputedStyle(el).color); el.remove(); return rgb;
        });
        const mix = (a, b, opacity) => a.map((value, i) => value * (1 - opacity) + b[i] * opacity);
        const surfaces = [base, mix(base, mint, .65), mix(base, pink, .45), mix(mix(base, pink, .45), mint, .65)].map(luminance);
        return [...document.querySelectorAll('.hero-copy h1, .hero-copy h1 span, .hero-tagline, .hero-note strong, .hero-note small')].map(el => ({
          text: el.textContent, ratio: Math.min(...surfaces.map(bg => ratio(luminance(color(getComputedStyle(el).color)), bg))),
        }));
      });
      contrast.forEach(item => expect(item.ratio, item.text).toBeGreaterThanOrEqual(4.5));
      expect(await page.locator('.home-page').innerText()).not.toMatch(/khô nhớ|khó nhớ|MẪu|\uFFFD|áº|á»|Ã©/);
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ sáng' }).click();
    }
  }
  await nav.getByRole('button', { name: 'Trang chủ', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('button', { name: 'Kho học liệu', exact: true })).toBeFocused();
  expect(await nav.getByRole('button', { name: 'Kho học liệu', exact: true }).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/materials$/);
  await nav.getByRole('button', { name: 'Trang chủ', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Mở Nova AI Tutor', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trò chuyện với Nova' })).toContainText('Bee kawaii');
  await page.keyboard.press('Escape');
  expect(await page.locator('.hero-section').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('.logo-3d').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.locator('.landing-hero')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await nav.evaluate(el => { const r = el.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2); })).toBeLessThanOrEqual(1);
  const css = readFileSync(join(__dirname, '../src/App.css'), 'utf8').split('/* Balanced navigation')[1];
  expect(css).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  expect(errors).toEqual([]);
});

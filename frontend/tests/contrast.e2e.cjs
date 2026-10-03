const { test, expect } = require('@playwright/test');

// Inspect actual painted token colours, including alpha layers and gradient stops.
function auditContrast() {
  const canvas = document.createElement('canvas').getContext('2d');
  function rgba(value) {
    canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = value; canvas.fillRect(0, 0, 1, 1);
    return [...canvas.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v);
  }
  const over = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  function backgrounds(el) {
    if (!el) return [rgba(getComputedStyle(document.documentElement).getPropertyValue('--background'))];
    const style = getComputedStyle(el), base = backgrounds(el.parentElement).map(bg => over(rgba(style.backgroundColor), bg));
    const stops = style.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g);
    return stops ? stops.flatMap(stop => base.map(bg => over(rgba(stop), bg))) : base;
  }
  const failures = [], measurements = [];
  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    if (!rect.width || !rect.height || style.visibility !== 'visible' || el.closest('[hidden],svg')) continue;
    const text = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
    const placeholder = el.matches('input,textarea') && el.placeholder && !el.value;
    if (!text && !placeholder && !el.matches('select,input[type=submit]')) continue;
    const foreground = rgba(placeholder ? getComputedStyle(el, '::placeholder').color : style.color);
    let opacity = 1; for (let p = el; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
    foreground[3] *= opacity;
    const minimum = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700 ? 3 : 4.5;
    const contrast = Math.min(...backgrounds(el).map(bg => ratio(over(foreground, bg), bg)));
    const item = { element: el.tagName + '.' + String(el.className), parent: el.parentElement.className, text: (text || el.placeholder || el.value).slice(0, 70), ratio: +contrast.toFixed(2), minimum, color: style.color, background: style.backgroundColor };
    measurements.push(item); if (contrast + .005 < minimum) failures.push(item);
  }
  for (const el of document.querySelectorAll('button svg,a svg')) {
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    if (!rect.width || !rect.height || style.visibility !== 'visible' || el.closest('[hidden]')) continue;
    const foreground = rgba(style.color);
    const contrast = Math.min(...backgrounds(el).map(bg => ratio(over(foreground, bg), bg)));
    const item = { element: 'svg.' + el.getAttribute('class'), parent: el.parentElement.className, text: 'Control icon', ratio: +contrast.toFixed(2), minimum: 3 };
    measurements.push(item); if (contrast + .005 < 3) failures.push(item);
  }
  return { failures, measurements };
}

test('all seven pages: painted text contrast in light/dark, forced colours and colour-vision simulations', async ({ page, context }) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = [];
  await page.goto('/dashboard'); await expect(page.locator('.home-page--guest')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.querySelectorAll('*').forEach(el => el.style.transitionDuration = '0s'); }, theme);
    await page.screenshot({ path: test.info().outputPath(`guest-${theme}.png`), fullPage: true });
    results.push({ route: 'guest-home', theme, ...await page.evaluate(auditContrast) });
  }
  const email = `contrast-${Date.now()}@studyhub.test`;
  expect((await context.request.post('/api/auth/register', { data: { first_name: 'Contrast', last_name: 'QA', email, password: 'ContrastTest123!' } })).ok()).toBe(true);
  const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.STUDYHUB_E2E_DB_PATH);
  db.prepare("INSERT INTO subscriptions(user_id,plan_id,status) SELECT u.id,p.id,'active' FROM users u,plans p WHERE u.email=? AND p.name='Premium'").run(email); db.close();
  const subject = await (await context.request.post('/api/subjects', { data: { code: 'AA', name: 'Contrast subject' } })).json();
  const quiz = await (await context.request.post('/api/quizzes/manual', { data: { subject_id: subject.id, title: 'Contrast quiz', questions: [{ question: '2 + 2?', options: ['1', '2', '3', '4'], correct_index: 3 }] } })).json();
  const run = await (await context.request.post('/api/quiz-attempts', { data: { quizId: quiz.id, idempotencyKey: `contrast-${Date.now()}` } })).json();
  expect((await context.request.post(`/api/quiz-attempts/${run.attemptId}/submit`, { data: { answers: { [quiz.questions[0].id]: 3 } } })).ok()).toBe(true);
  for (const color of ['#38bdf8', '#4ade80', '#a78bfa']) await context.request.post('/api/flashcards/manual', { data: { subject_id: subject.id, name: `Deck ${color}`, color, cards: [{ front: 'English', back: 'database' }] } });
  const session = await context.newCDPSession(page);
  for (const route of ['/dashboard', '/app/materials', '/app/quiz', '/app/roadmap', '/app/progress', '/app/ai-tutor', '/app/plans']) {
    await page.goto(route); await expect(page.locator('header.topbar')).toBeVisible();
    if (route === '/app/progress') await expect(page.locator('.progress-ai-analytics')).toBeVisible();
    if (route === '/app/ai-tutor') await expect(page.locator('.tutor-input-shell')).toBeVisible();
    if (route === '/app/quiz') await expect(page.locator('.qc-quiz')).toHaveCount(1);
    if (route === '/app/roadmap') {
      await expect(page.getByText('Đang tải dữ liệu lộ trình...', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Tạo lộ trình đầu tiên', exact: true })).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.querySelectorAll('*').forEach(el => { el.style.transitionDuration = '0s'; el.style.animationDuration = '0s'; }); }, theme);
      await page.screenshot({ path: test.info().outputPath(`${route.replaceAll('/', '_')}-${theme}.png`), fullPage: true });
      const audit = await page.evaluate(auditContrast); results.push({ route, theme, ...audit });
      for (const state of ['hover', 'focus', 'active']) {
        const button = page.locator('.qc-mint,.btn-primary').first();
        if (await button.count()) {
          if (state === 'hover') await button.hover();
          if (state === 'focus') await button.focus();
          if (state === 'active') { await button.hover(); await page.mouse.down(); }
          results.push({ route, theme, state, ...await page.evaluate(auditContrast) });
          if (state === 'active') { await page.mouse.move(0, 0); await page.mouse.up(); }
        }
      }
      for (const type of ['deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia']) {
        await session.send('Emulation.setEmulatedVisionDeficiency', { type });
        await page.screenshot({ path: test.info().outputPath(`${route.replaceAll('/', '_')}-${theme}-${type}.png`), fullPage: true });
      }
      await session.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await page.screenshot({ path: test.info().outputPath(`${route.replaceAll('/', '_')}-${theme}-forced.png`), fullPage: true });
      results.push({ route, theme, forcedColors: true, ...await page.evaluate(auditContrast) });
      await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    }
  }
  await page.goto('/app/quiz');
  await page.getByRole('button', { name: 'Tạo bài trắc nghiệm', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (const theme of ['light', 'dark']) for (const mode of ['Tự động', 'Thủ công']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.getByRole('dialog').getByRole('button', { name: mode, exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`quiz-dialog-${theme}-${mode}.png`), fullPage: true });
    results.push({ route: 'quiz-dialog', theme, mode, ...await page.evaluate(auditContrast) });
  }
  require('node:fs').writeFileSync(test.info().outputPath('measurements.json'), JSON.stringify(results, null, 2));
  await test.info().attach('contrast-measurements', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.flatMap(r => r.failures.map(f => ({ route: r.route, theme: r.theme, ...f })))).toEqual([]);
});

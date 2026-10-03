const { test, expect } = require('@playwright/test');

async function setup(context) {
  const email = `progress-${Date.now()}-${Math.random()}@studyhub.test`, password = 'StudyHubTest123!';
  const registered = await context.request.post('/api/auth/register', { data: { first_name: 'Progress', last_name: 'QA', email, password } });
  expect(registered.ok()).toBe(true);
  const subject = await (await context.request.post('/api/subjects', { data: { code: 'PROG', name: 'Progress QA' } })).json();
  const quiz = await (await context.request.post('/api/quizzes/manual', { data: {
    subject_id: subject.id, title: 'Progress quiz', questions: Array.from({ length: 5 }, (_, i) => ({ question: `Câu ${i + 1}: 2 + 2 = ?`, options: ['1', '2', '3', '4'], correct_index: 3 })),
  } })).json();
  const deck = await (await context.request.post('/api/flashcards/manual', { data: {
    subject_id: subject.id, name: 'Progress deck', cards: [{ front: 'A', back: 'Answer A' }, { front: 'B', back: 'Answer B' }],
  } })).json();
  return { email, password, quiz, deck };
}
const summary = async context => (await context.request.get('/api/progress/summary')).json();
const nav = (page, name) => page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name, exact: true });
async function openQuiz(page) {
  await page.goto('/app/quiz');
  await page.locator('.qc-quiz').getByRole('button', { name: 'Làm bài', exact: true }).click();
  await expect(page.locator('.qc-taking')).toBeVisible();
}
async function answerFive(page) {
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: `Đi đến câu ${i + 1}`, exact: true }).click();
    await page.locator('.quiz-option').nth(i < 3 ? 3 : 0).click();
  }
}
async function expectProgress(page, xp = 35, cards = 0) {
  await expect(page.locator('.progress-metric--accuracy strong')).toHaveText('60%');
  await expect(page.locator('.progress-metric--accuracy small')).toContainText('3 câu trả lời đúng');
  await expect(page.locator('.progress-metric--xp strong')).toHaveText(`${xp} XP`);
  await expect(page.locator('.progress-metric--answer strong')).toHaveText(String(cards));
  await expect(page.locator('.progress-today li').nth(1)).toContainText('5 câu Quiz đã trả lời');
  await expect(page.locator('.progress-chart__bar')).toHaveCount(1);
}

test('3/5, resume, two reviews, immediate progress, themes and login persistence', async ({ page, context }) => {
  const { email, password } = await setup(context);
  await page.goto('/app/progress');
  await expect(page.locator('.progress-chart-empty')).toContainText('Làm một bài quiz để bắt đầu theo dõi');
  await expect(page.locator('.progress-metric strong')).toHaveText(['0 ngày', '0 XP', '0', '0%']);
  await openQuiz(page); await answerFive(page);
  await expect.poll(async () => (await summary(context)).questions_answered).toBe(5);
  await nav(page, 'Tiến độ').click(); await expectProgress(page, 0);
  await page.goto('/app/quiz');
  await page.locator('.qc-quiz').getByRole('button', { name: 'Làm bài', exact: true }).click();
  await expect(page.locator('.quiz-step.is-answered')).toHaveCount(5);
  await page.getByRole('button', { name: 'Hoàn thành bài', exact: true }).click();
  await expect(page.locator('.qc-finished > strong')).toHaveText('3 / 5');
  await nav(page, 'Tiến độ').click(); await expectProgress(page);
  await page.goto('/app/quiz');
  await page.locator('.qc-deck').getByRole('button', { name: 'Ôn lại', exact: true }).click();
  await page.getByRole('button', { name: /Ôn lại tất cả/ }).click();
  for (let i = 0; i < 2; i++) {
    await expect(page.locator('.study-session-counter')).toHaveText(`Thẻ ${i + 1}/2`);
    await page.locator('.study-card').click();
    await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
  }
  await expect(page.locator('.study-session-result')).toBeVisible();
  await expect(page.locator('.qc-learning-progress').last()).toContainText('2 / 2 thẻ đã nhớ');
  await page.locator('.study-session-result').getByRole('button', { name: 'Đóng', exact: true }).click();
  await nav(page, 'Tiến độ').click(); await expectProgress(page, 45, 2);
  for (const [label, count] of [['8 tuần', 8], ['6 tháng', 6], ['7 ngày', 7]]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.progress-chart__column')).toHaveCount(count);
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
      await expect.poll(() => page.locator('.progress-command__hero h1').evaluate(el => {
        const probe = document.createElement('span'); probe.style.color = 'var(--text-dark)'; document.body.append(probe);
        const ready = getComputedStyle(el).color === getComputedStyle(probe).color; probe.remove(); return ready;
      })).toBe(true);
      await expect.poll(() => page.locator('.progress-range button.is-active').evaluate(el => {
        const probe = document.createElement('span'); probe.style.color = 'var(--pink-ink)'; probe.style.background = 'var(--pink-soft)'; document.body.append(probe);
        const ready = getComputedStyle(el).color === getComputedStyle(probe).color && getComputedStyle(el).backgroundColor === getComputedStyle(probe).backgroundColor;
        probe.remove(); return ready;
      })).toBe(true);
      const contrasts = await page.locator('.progress-command').evaluate(root => {
        const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        return [...root.querySelectorAll('h1,h2,h3,p,.progress-metric span,.progress-metric strong,.progress-metric small,.progress-level small,.progress-section-label,.progress-chart__value,.progress-chart__label,.progress-range button,.progress-today li span')].map(el => {
          let bg = el; while (getComputedStyle(bg).backgroundColor === 'rgba(0, 0, 0, 0)') bg = bg.parentElement;
          const a = luminance(getComputedStyle(el).color), b = luminance(getComputedStyle(bg).backgroundColor);
          return { text: el.textContent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
      });
      for (const item of contrasts) expect(item.ratio, `${theme}: ${item.text}`).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.progress-chart__column').evaluateAll(columns => columns.every(column => column.getBoundingClientRect().top === columns[0].getBoundingClientRect().top))).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`progress-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      if (theme === 'dark') await page.getByRole('button', { name: 'Bật chế độ sáng' }).click();
    }
  }
  await page.reload(); await expectProgress(page, 45, 2);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.locator('.home-page--guest')).toBeVisible();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).first().click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('.studyhub-auth__submit').click();
  await expect(page.locator('.home-page--member')).toBeVisible();
  await nav(page, 'Tiến độ').click(); await expectProgress(page, 45, 2);
});

test('an offline queue never syncs under a different account', async ({ page, context }) => {
  const original = await setup(context); await openQuiz(page);
  await context.setOffline(true); await answerFive(page);
  await page.route('**/api/quiz-attempts/*/answers', route => route.abort());
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.locator('.home-page--guest')).toBeVisible();
  await setup(context); await page.goto('/dashboard');
  await expect(page.locator('.home-page--member')).toBeVisible();
  await expect(page.locator('.study-sync-notice')).toHaveCount(0);
  expect((await summary(context)).questions_answered).toBe(0);
  await page.unroute('**/api/quiz-attempts/*/answers');
  await context.request.post('/api/auth/logout');
  await context.request.post('/api/auth/login', { data: { email: original.email, password: original.password } });
  await page.reload();
  await expect.poll(async () => (await summary(context)).questions_answered).toBe(5);
  await expect(page.locator('.study-sync-notice')).toHaveCount(0);
});

test('roadmap multiple choice saves on selection and grades idempotently', async ({ page, context }) => {
  const { email } = await setup(context);
  // A paid test fixture in the isolated QA database, never through the real payment flow.
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.env.STUDYHUB_E2E_DB_PATH);
  try { db.prepare("INSERT INTO subscriptions(user_id,plan_id,status) SELECT u.id,p.id,'active' FROM users u,plans p WHERE u.email=? AND p.name='Premium'").run(email); }
  finally { db.close(); }
  const created = await context.request.post('/api/ai-tutor/roadmap', { data: { subject: 'Java', goal: 'Learn OOP', topics: ['Inheritance'] } });
  expect(created.status()).toBe(201);
  const { exercises } = await created.json();
  const exercise = exercises.find(item => item.exercise_type === 'multiple_choice');
  await page.goto('/dashboard'); await expect(page.locator('.home-page--member')).toBeVisible();
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: Exercises } = await import('/src/components/ai-tutor/AITutorExercise.jsx');
    const host = document.createElement('div'); host.id = 'exercises-test'; document.body.append(host);
    ReactDOM.createRoot(host).render(React.createElement(Exercises, {}));
  });
  const card = page.locator('#exercises-test .tutor-exercise').filter({ hasText: exercise.prompt.slice(0, 80) });
  await card.locator('.tutor-exercise-head').click();
  const started = page.waitForResponse(response => new URL(response.url()).pathname === '/api/quiz-attempts' && response.request().method() === 'POST');
  await card.locator('.tutor-options label').first().click();
  const run = await (await started).json();
  await expect.poll(async () => (await summary(context)).questions_answered).toBe(1);
  await card.getByRole('button', { name: 'Nộp bài', exact: true }).click();
  await expect(card.locator('.tutor-grade-pill')).not.toHaveClass(/todo/);
  const before = await summary(context);
  expect(before.xp).toBeGreaterThan(0);
  const repeated = await context.request.post(`/api/ai-tutor/exercises/${exercise.id}/submit`, { data: { answer: exercise.options[0], answer_type: 'choice', attemptId: run.attemptId } });
  expect(repeated.status()).toBe(201);
  expect((await summary(context)).xp).toBe(before.xp);
});

test('offline answers and lost submit response survive reload without duplicated XP', async ({ page, context }) => {
  await setup(context); await openQuiz(page);
  await context.setOffline(true); await answerFive(page);
  await page.getByRole('button', { name: 'Hoàn thành bài', exact: true }).click();
  await expect(page.locator('.study-sync-notice')).toContainText('Chưa đồng bộ');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('studyhub-study-outbox:')))).length)).toBe(6);
  await page.route('**/api/quiz-attempts/*/answers', route => route.abort());
  let lost = false;
  await page.route('**/api/quiz-attempts/*/submit', async route => {
    if (!lost) { lost = true; await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  await context.setOffline(false); await page.reload();
  await expect(page.locator('.study-sync-notice')).toBeVisible();
  expect((await summary(context)).questions_answered).toBe(0);
  await page.unroute('**/api/quiz-attempts/*/answers');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await summary(context)).xp).toBe(35);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.study-sync-notice')).toHaveCount(0);
  await nav(page, 'Tiến độ').click(); await expectProgress(page);
  const data = await summary(context);
  expect(data.questions_answered).toBe(5); expect(data.attempts).toBe(1); expect(data.streak).toBe(1);
});

test('Nova quick quiz uses server grading and restores completed attempt', async ({ page, context }) => {
  const { quiz } = await setup(context);
  await page.goto('/dashboard'); await expect(page.locator('.home-page--member')).toBeVisible();
  const mount = () => page.evaluate(async quiz => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: Quiz } = await import('/src/components/ai-tutor/AITutorQuiz.jsx');
    const host = document.createElement('div'); host.id = 'nova-test'; document.body.append(host);
    window.novaRoot = ReactDOM.createRoot(host);
    window.novaRoot.render(React.createElement(Quiz, { quiz: { quiz_id: quiz.id, topic: 'Nova test', questions: quiz.questions.map(q => ({ ...q, answer_index: 0 })) } }));
  }, quiz);
  await mount();
  for (let i = 0; i < 5; i++) await page.locator('#nova-test .tutor-options').nth(i).locator('label').nth(i < 3 ? 3 : 0).click();
  await page.getByRole('button', { name: 'Kiểm tra đáp án', exact: true }).click();
  await expect(page.locator('#nova-test .tutor-flag')).toHaveText('Đúng 3/5 câu');
  await page.evaluate(() => { window.novaRoot.unmount(); document.getElementById('nova-test').remove(); });
  await mount(); await expect(page.locator('#nova-test .tutor-flag')).toHaveText('Đúng 3/5 câu');
  expect((await summary(context)).xp).toBe(35);
});

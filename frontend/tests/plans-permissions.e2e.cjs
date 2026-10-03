const { test, expect } = require('@playwright/test');

const plans = [
  { code: 'free', name: 'Gói Khởi Động', badge: 'Miễn phí vĩnh viễn', price: '0đ', subtitle: 'Dành cho sinh viên mới bắt đầu', docs: 10, storage: 200 * 1024 ** 2, limit: 5,
    items: ['Tải lên tối đa 10 tài liệu', '200 MB dung lượng lưu trữ', 'Quiz Card và Flashcard cơ bản', 'AI Tutor 5 lượt mỗi ngày', 'Theo dõi tiến độ cơ bản', 'Đầy đủ tính năng Deep Focus'],
    excluded: ['Giới hạn số tài liệu và dung lượng', 'Không gồm các tính năng AI nâng cao'] },
  { code: 'plus', name: 'Gói Pro Sinh Viên', badge: 'Khuyến dùng cho sinh viên', price: '199.000đ', subtitle: 'Cá nhân hóa việc học mỗi ngày', docs: 50, storage: 2 * 1024 ** 3, limit: 200,
    items: ['Tải lên tối đa 50 tài liệu', '2 GB dung lượng lưu trữ', 'Quiz Card và Flashcard nâng cao', 'AI Tutor 200 lượt mỗi tháng', 'Phân tích học tập bằng AI', 'Lộ trình học cá nhân hóa'],
    excluded: ['Dung lượng tối đa 2 GB', 'Một số tính năng AI chuyên sâu cần gói Master'] },
  { code: 'pro', name: 'Gói Master Thủ Khoa', badge: 'Nâng cấp học bổng VIP', price: '299.000đ', subtitle: 'Dành cho học chuyên sâu và luyện thi', docs: 200, storage: 5 * 1024 ** 3, limit: null,
    items: ['Tải lên tối đa 200 tài liệu', '5 GB dung lượng lưu trữ', 'Tất cả quyền lợi của gói Pro Sinh Viên', 'Sử dụng nhiều mô hình AI', 'Phân tích tài liệu chuyên sâu', 'Hạn mức AI Tutor cao hơn', 'Lộ trình học nâng cao'], excluded: [] },
];

async function setup(page, context) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await context.request.post('/api/auth/register', { data: { first_name: 'Plans', last_name: 'QA', email: `plans-${Date.now()}-${Math.random()}@studyhub.test`, password: 'PlanTest123!' } });
  expect(response.status()).toBe(201);
  let plan = plans[0], used = 0, documents = 0;
  await page.route('**/api/subscription', route => route.fulfill({ json: { plan: plan.code, status: 'active', permissions: {
    max_documents: plan.docs, storage_bytes: plan.storage, tutor_limit: plan.limit, tutor_period: plan.code === 'free' ? 'day' : 'month',
    tutor_used: used, document_count: documents, storage_used_bytes: 0,
  } } }));
  await page.route('**/api/ai-tutor/engine', route => route.fulfill({ json: { engine: 'local', label: 'Test', models: ['test-model'] } }));
  return (next, usage = 0, count = 0) => { plan = next; used = usage; documents = count; };
}

test('exact plan cards, current buttons, responsive layout and readable light/dark themes', async ({ page, context }) => {
  const choose = await setup(page, context);
  for (const current of plans) {
    choose(current);
    await page.goto('/app/plans');
    await expect(page.locator(`.pricing-card-${current.code} button`)).toHaveText('Gói hiện tại');
    await expect(page.locator(`.pricing-card-${current.code} button`)).toBeDisabled();
    for (const plan of plans) {
      const card = page.locator(`.pricing-card-${plan.code}`);
      await expect(card.locator('h3')).toHaveText(plan.name);
      await expect(card.locator('.price-amount')).toHaveText(plan.price);
      await expect(card.locator('.plan-usage')).toHaveText(plan.subtitle);
      await expect(card.locator('.plan-badge,.pricing-ribbon-badge')).toHaveText(plan.badge);
      await expect(card.locator('.price-features-list li span')).toHaveText(plan.items);
      await expect(card.locator('.price-limits-list li span')).toHaveText(plan.excluded);
      if (plan !== current) {
        await expect(card.locator('button')).toBeEnabled();
        await expect(card.locator('button')).toHaveText(plan.code === 'free' ? 'Chuyển về Gói Khởi Động' : `Chọn ${plan.name}`);
      }
    }
  }
  await expect(page.locator('.pricing-page')).not.toContainText('Phổ biến nhất');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const cards = await page.locator('.price-card').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      }));
      if (width > 850) expect(Math.max(...cards.map(c => c.y)) - Math.min(...cards.map(c => c.y))).toBeLessThan(2);
      else expect(cards[1].y).toBeGreaterThan(cards[0].y + 100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const contrasts = await page.locator('.price-card').evaluateAll(elements => {
        const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        return elements.flatMap(card => [...card.querySelectorAll('h3,h4,p,li span,.price-amount,.price-period,.plan-badge,.pricing-ribbon-badge,button')].map(element => {
          for (let parent = element; parent && parent !== card.parentElement; parent = parent.parentElement) {
            if (getComputedStyle(parent).opacity !== '1') throw new Error('Plan text must not be faded: ' + element.textContent);
          }
          let bg = element;
          while (getComputedStyle(bg).backgroundColor === 'rgba(0, 0, 0, 0)' && bg.parentElement) bg = bg.parentElement;
          const a = luminance(getComputedStyle(element).color), b = luminance(getComputedStyle(bg).backgroundColor);
          return { text: element.textContent, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        }));
      });
      for (const item of contrasts) expect(item.contrast, `${theme}: ${item.text}`).toBeGreaterThanOrEqual(4.5);
      await page.locator('.price-grid').screenshot({ path: test.info().outputPath(`plans-${theme}-${width}.png`) });
    }
  }
});

test('plan locks disable actions without removing basic quiz or Deep Focus', async ({ page, context }) => {
  const choose = await setup(page, context);
  for (const plan of plans) {
    choose(plan);
    await page.goto('/app/quiz');
    await page.getByRole('button', { name: 'Tạo bài trắc nghiệm', exact: true }).first().click();
    const auto = page.getByRole('dialog').getByRole('button', { name: 'Tự động', exact: true });
    if (plan.code === 'free') {
      await expect(auto).toBeDisabled();
      await expect(auto).toHaveAttribute('title', 'Nâng cấp để sử dụng');
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Thủ công', exact: true })).toBeEnabled();
    } else await expect(auto).toBeEnabled();
    await page.goto('/app/roadmap');
    const create = page.locator('.roadmap-create-button');
    if (plan.code === 'free') await expect(create).toBeDisabled();
    else await expect(create).toBeEnabled();
    await page.goto('/app/ai-tutor');
    await expect(page.locator('.tutor-input-shell textarea')).toBeEnabled();
    const deep = page.locator('.tutor-chat-controls option[value="deep"]');
    if (plan.code !== 'pro') await expect(deep).toHaveAttribute('disabled', '');
    else await expect(deep).not.toHaveAttribute('disabled');
    const model = page.locator('.tutor-chat-controls select').nth(1);
    if (plan.code === 'pro') await expect(model).toBeEnabled();
    else {
      await expect(model).toBeDisabled();
      await expect(model).toHaveAttribute('title', 'Nâng cấp để sử dụng');
    }
    if (plan.limit !== null) {
      choose(plan, plan.limit, plan.docs);
      await page.reload();
      await expect(page.locator('.tutor-input-shell textarea')).toBeDisabled();
      await expect(page.locator('.tutor-send')).toBeDisabled();
      await expect(page.locator('.tutor-attach')).toBeDisabled();
      await page.goto('/app/materials');
      await expect(page.locator('.hero-upload')).toBeDisabled();
      await page.goto('/dashboard');
      await page.getByRole('button', { name: 'Mở Nova AI Tutor', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Gửi câu hỏi', exact: true })).toBeDisabled();
      await expect(page.getByLabel('Câu hỏi dành cho Nova', { exact: true })).toBeDisabled();
    }
  }
});

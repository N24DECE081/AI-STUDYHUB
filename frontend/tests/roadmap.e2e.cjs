const { test, expect } = require('@playwright/test');

test('new account sees an empty roadmap and an unselected wizard in light and dark mode', async ({ page, context }) => {
  const login = await context.request.post('/api/auth/login', { data: { email: 'student@studyhub.local', password: 'Student123!' } });
  expect(login.ok()).toBeTruthy();
  await context.request.post('/api/auth/profile', { data: { first_name: 'Test', last_name: 'Student' } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/app/roadmap');
  await expect(page.getByRole('heading', { name: 'Học theo cách của bạn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bạn chưa có lộ trình nào' })).toBeVisible();
  await expect(page.getByText('Upload tài liệu để Nova tạo lộ trình đầu tiên.')).toBeVisible();
  await expect(page.getByText('HỌC NHANH HÔM NAY')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo lộ trình mới' }).first().click();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('radio').first()).not.toBeChecked();
  await expect(page.getByRole('radio').last()).not.toBeChecked();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.getByText('Hãy chọn loại lộ trình.')).toBeVisible();
  await page.locator('.rm-wizard .rm-icon-button').click();
  await page.getByRole('button', { name: 'Bật chế độ tối' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

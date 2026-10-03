const { test, expect } = require('@playwright/test');

for (const kind of ['flashcard','quiz']) test(`manual ${kind}: author, retain draft, save and use without AI`, async ({page,context}) => {
  await context.request.post('/api/auth/register',{data:{first_name:'Manual',last_name:'QA',email:`manual-${kind}-${Date.now()}@studyhub.test`,password:'StudyHubTest123!'}});
  const subject=await (await context.request.post('/api/subjects',{data:{code:'MAN',name:'Môn tự tạo'}})).json();
  const flash=kind==='flashcard';
  await page.goto('/app/quiz');
  await page.getByRole('button',{name:flash?'Tạo bộ Flashcard':'Tạo bài trắc nghiệm',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Thủ công',exact:true}).click();
  await dialog.getByLabel('Môn học',{exact:true}).selectOption(String(subject.id));
  await dialog.getByLabel(flash?'Tên bộ Flashcard':'Tên bài trắc nghiệm',{exact:true}).fill('Bộ tự tạo QA');
  const save=dialog.getByRole('button',{name:flash?'Lưu bộ Flashcard':'Lưu bài trắc nghiệm'});
  await expect(save).toBeDisabled();
  if(flash) {
    await dialog.getByLabel('Mặt trước',{exact:true}).fill('Atomicity là gì?');
    await dialog.getByLabel('Mặt sau',{exact:true}).fill('Tất cả thành công hoặc cùng rollback.');
  } else {
    await dialog.getByLabel('Câu hỏi',{exact:true}).fill('2 + 2 bằng bao nhiêu?');
    for(const [i,value] of ['1','2','3','4'].entries()) await dialog.getByLabel(`Đáp án ${'ABCD'[i]}`,{exact:true}).fill(value);
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Chọn D là đáp án đúng').check();
    await dialog.getByLabel('Đáp án A',{exact:true}).fill('4');await expect(save).toBeDisabled();
    await dialog.getByLabel('Đáp án A',{exact:true}).fill('1');
  }
  await dialog.getByRole('button',{name:flash?'+ Thêm thẻ':'+ Thêm câu hỏi',exact:true}).click();
  await expect(save).toBeDisabled();
  await dialog.getByRole('button',{name:flash?'Xóa thẻ 2':'Xóa câu 2',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Tự động',exact:true})).toBeDisabled(); // Free accounts keep manual authoring, not paid AI generation.
  await dialog.getByRole('button',{name:'Thủ công',exact:true}).click();
  await expect(dialog.getByLabel(flash?'Tên bộ Flashcard':'Tên bài trắc nghiệm',{exact:true})).toHaveValue('Bộ tự tạo QA');
  await expect(save).toBeEnabled();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:test.info().outputPath(`manual-${kind}.png`),fullPage:true});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await save.click();
  if(flash) await expect(page.getByText('Atomicity là gì?',{exact:true})).toBeVisible();
  else {
    await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/1');
    await page.locator('.quiz-option').nth(3).click();
    await page.getByRole('button',{name:'Hoàn thành bài',exact:true}).click();
    await expect(page.locator('.qc-finished')).toContainText('1 / 1');
  }
  await page.reload();
  await expect(page.getByRole('heading',{name:'Bộ tự tạo QA',exact:true})).toBeVisible();
});

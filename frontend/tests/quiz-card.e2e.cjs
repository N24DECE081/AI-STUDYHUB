const { test, expect } = require('@playwright/test');

async function setup(page, context, count = 10) {
  await context.request.post('/api/auth/login', {data:{email:'student@studyhub.local',password:'Student123!'}});
  await context.request.post('/api/auth/profile', {data:{first_name:'QA',last_name:'Quiz'}});
  await page.route('**/api/documents', route => route.fulfill({json:[{id:901,title:'Giao dịch cơ sở dữ liệu',subject_code:'CSDL'}]}));
  const questions = Array.from({length:count}, (_,i)=>({id:`q${i+1}`,question:`Tình huống giao dịch số ${i+1} cần thuộc tính nào?`,options:['Atomicity','Isolation','Durability','Consistency'],difficulty:'apply'}));
  let submissions = 0;
  await page.route('**/api/quizzes/generate', route => {
    expect(route.request().postDataJSON().question_count).toBe(count);
    return route.fulfill({status:201,json:{id:901,title:'Giao dịch',questions,question_count:count}});
  });
  await page.route('**/api/quizzes/901/submit', route => {
    submissions++;
    expect(route.request().postDataJSON().answers.q1).toBe(0);
    return route.fulfill({json:{score:1,total:count,score_10:10/count,items:questions.map(q=>({...q,correct:q.id==='q1',correct_index:0,explanation:'Atomicity hỗ trợ rollback toàn bộ.'}))}});
  });
  await page.goto('/app/quiz');
  await page.getByLabel('Giao dịch cơ sở dữ liệu').check();
  return () => submissions;
}

test('reject invalid counts and retain quiz behind accessible submit confirmation', async ({page,context})=>{
  const submissions = await setup(page,context);
  const count = page.getByLabel('Số câu hỏi');
  for (const value of ['', '0', '-1', '1.5', 'abc', '121', '1200', '1e2']) {
    await count.fill(value);
    await expect(page.getByRole('button',{name:/Tạo Quiz Card/})).toBeDisabled();
  }
  await count.fill('10');
  await page.getByRole('button',{name:/Tạo Quiz Card/}).click();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/10');
  await expect(page.getByRole('button',{name:'Đi đến câu 1',exact:true})).toBeInViewport();
  await page.locator('.quiz-option').first().click();
  await page.getByRole('button',{name:'Nộp bài & xem giải thích'}).click();
  await expect(page.getByRole('alertdialog')).toContainText('9 câu chưa trả lời');
  await expect(page.locator('.quiz-flashcard')).toBeVisible();
  await expect(page.locator('.quiz-option input').first()).toBeChecked();
  expect(await page.locator('dialog').evaluate(el=>getComputedStyle(el,'::backdrop').backgroundColor)).toBe('rgba(15, 23, 42, 0.38)');
  await page.screenshot({path:test.info().outputPath('quiz-confirm-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Không, làm tiếp'}).click();
  expect(submissions()).toBe(0);
  await expect(page.locator('.quiz-option input').first()).toBeChecked();
  await page.getByRole('button',{name:'Nộp bài & xem giải thích'}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Nộp bài & xem giải thích'}).click();
  await page.getByRole('button',{name:'Có, nộp bài'}).click();
  await expect(page.locator('.quiz-explanation')).toContainText('Atomicity');
  expect(submissions()).toBe(1);
});

test('120 questions start at one and remain reachable on mobile; generation resets position',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});
  await setup(page,context,120);
  await page.getByLabel('Số câu hỏi').fill('120');
  await page.getByRole('button',{name:/Tạo Quiz Card/}).click();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/120');
  const first = page.getByRole('button',{name:'Đi đến câu 1',exact:true});
  await first.scrollIntoViewIfNeeded(); await expect(first).toBeInViewport();
  await page.getByRole('button',{name:'Đi đến câu 120',exact:true}).click();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 120/120');
  await page.getByRole('button',{name:'Nộp bài & xem giải thích'}).click();
  await expect(page.getByRole('alertdialog')).toContainText('120 câu chưa trả lời');
  await page.screenshot({path:test.info().outputPath('quiz-confirm-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Không, làm tiếp'}).click();
  await page.getByRole('button',{name:'Chọn lại tài liệu'}).click();
  await page.getByRole('button',{name:/Tạo Quiz Card/}).click();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/120');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('one question submits directly when complete; failed generation keeps selection', async ({page,context})=>{
  const submissions = await setup(page,context,1);
  await page.getByLabel('Số câu hỏi').fill('1');
  await page.route('**/api/quizzes/generate',route=>route.fulfill({status:503,json:{error:'AI chưa sẵn sàng'}}));
  await page.getByRole('button',{name:/Tạo Quiz Card/}).click();
  await expect(page.getByRole('alert')).toContainText('AI chưa sẵn sàng');
  await expect(page.getByLabel('Số câu hỏi')).toHaveValue('1');
  await expect(page.getByLabel('Giao dịch cơ sở dữ liệu')).toBeChecked();
  await page.unroute('**/api/quizzes/generate');
  await page.route('**/api/quizzes/generate',route=>route.fulfill({status:201,json:{id:901,title:'Giao dịch',question_count:1,questions:[{id:'q1',question:'Thuộc tính nào giúp rollback toàn bộ?',options:['Atomicity','Isolation','Durability','Consistency']}]}}));
  await page.getByRole('button',{name:/Tạo Quiz Card/}).click();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/1');
  await page.locator('.quiz-option').first().click();
  await page.getByRole('button',{name:'Nộp bài & xem giải thích'}).click();
  await expect(page.locator('.quiz-explanation')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(submissions()).toBe(1);
});

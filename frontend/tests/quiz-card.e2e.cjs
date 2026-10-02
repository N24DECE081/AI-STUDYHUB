const { test, expect } = require('@playwright/test');

async function setup(page, context) {
  await context.request.post('/api/auth/register',{data:{first_name:'QA',last_name:'Redesign',email:`quiz-${Date.now()}-${Math.random()}@studyhub.test`,password:'StudyHubTest123!'}});
  const a=await (await context.request.post('/api/subjects',{data:{code:'DB',name:'Cơ sở dữ liệu'}})).json();
  const b=await (await context.request.post('/api/subjects',{data:{code:'JAVA',name:'Lập trình Java'}})).json();
  const docs=[];
  for (const [subject,title] of [[a,'Giao dịch'],[a,'Ràng buộc'],[b,'Kế thừa']]) {
    const response=await context.request.post('/api/upload',{multipart:{subject_id:String(subject.id),title,file:{name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('Atomicity ensures operations succeed or roll back together. '.repeat(400))}}});
    expect(response.status()).toBe(201);docs.push((await response.json()).document_id);
  }
  const state={quizzes:[],submissions:0,runs:0,saved:{},generationError:false};
  await page.route('**/api/quizzes/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/limits'))return route.continue();
    const data=route.request().method()==='POST'?route.request().postDataJSON():{};
    if(path.endsWith('/history'))return route.fulfill({json:{items:state.quizzes}});
    if(path.endsWith('/generate')) {
      if(state.generationError)return route.fulfill({status:503,json:{error:'Nova chưa thể tạo bài trắc nghiệm lúc này.'}});
      expect(data.subject_id).toBe(a.id);expect(data.document_ids.every(id=>docs.slice(0,2).includes(id))).toBe(true);
      const quiz={id:901,title:data.title || 'Quiz CSDL',subject:a.name,time_limit:data.time_limit,difficulty:data.difficulty,question_count:data.question_count,attempts:[],questions:Array.from({length:data.question_count},(_,i)=>({id:`q${i+1}`,question:`Giao dịch trong tình huống ${i+1} cần thuộc tính nào?`,options:['Atomicity','Isolation','Durability','Consistency'],difficulty:'apply'}))};
      state.quizzes=[quiz];return route.fulfill({status:201,json:quiz});
    }
    if(path.endsWith('/start')) {state.runs++;state.saved={};const now=Date.now()/1000;return route.fulfill({json:{run_id:state.runs,server_now:now,started_at:now,deadline:state.quizzes[0].time_limit?now+state.quizzes[0].time_limit*60:null}});}
    if(path.endsWith('/answers')){state.saved=data.answers;return route.fulfill({json:{saved:true}});}
    if(path.endsWith('/submit')) {
      state.submissions++;const quiz=state.quizzes[0];const items=quiz.questions.map(q=>({...q,selected_index:data.answers[q.id]??null,correct:data.answers[q.id]===0,correct_index:0,explanation:'Atomicity đảm bảo rollback toàn bộ.'}));
      const score=items.filter(q=>q.correct).length;quiz.attempts.unshift({score,total:quiz.question_count,score_10:score*10/quiz.question_count});
      return route.fulfill({json:{score,total:quiz.question_count,score_10:score*10/quiz.question_count,duration:quiz.time_limit?60:12,weak_count:quiz.question_count-score,weak_items:items.filter(q=>!q.correct),items}});
    }
    if(path.endsWith('/rename')){state.quizzes[0].title=data.name;return route.fulfill({json:state.quizzes[0]});}
    if(route.request().method()==='DELETE'){state.quizzes=[];return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:state.quizzes[0]});
  });
  await page.goto('/app/quiz');
  return {a,b,docs,state};
}
async function quizForm(page,subject) {
  await page.getByRole('button',{name:'Tạo bài trắc nghiệm',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('Chọn môn học trước để xem tài liệu của bạn.')).toBeVisible();
  await dialog.getByLabel('Môn học',{exact:true}).selectOption(String(subject.id));
  await dialog.getByLabel('Giao dịch').check();await dialog.getByLabel('Ràng buộc').check();
  await expect(dialog.getByText('Tối đa 100 câu dựa trên tài liệu đã chọn.')).toBeVisible();
  return dialog;
}

test('subject-first quiz flow, invalid counts, confirmation, result, retake, rename and delete',async({page,context})=>{
  const {a,b,state}=await setup(page,context);
  await page.screenshot({path:test.info().outputPath('homepage-empty.png'),fullPage:true});
  let dialog=await quizForm(page,a);
  await dialog.getByLabel('Môn học',{exact:true}).selectOption(String(b.id));
  await expect(dialog.getByLabel('Giao dịch')).toHaveCount(0);await expect(dialog.getByText('Đã chọn 0 tài liệu',{exact:false})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Tạo bài với Nova AI'})).toBeDisabled();
  await dialog.getByLabel('Môn học',{exact:true}).selectOption(String(a.id));
  await dialog.getByLabel('Giao dịch').check();await dialog.getByLabel('Ràng buộc').check();
  await expect(dialog.getByText('Tối đa 100 câu dựa trên tài liệu đã chọn.')).toBeVisible();
  for(const value of ['', '0', '-1','1.5','abc','101','1000','1e2']){await dialog.getByLabel('Số câu hỏi').fill(value);await expect(dialog.getByRole('button',{name:'Tạo bài với Nova AI'})).toBeDisabled();}
  await dialog.getByLabel('Số câu hỏi').fill('10');await dialog.getByLabel('Độ khó').selectOption('hard');
  state.generationError=true;await dialog.getByRole('button',{name:'Tạo bài với Nova AI'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Nova chưa thể');await expect(dialog.getByLabel('Giao dịch')).toBeChecked();
  state.generationError=false;await dialog.getByRole('button',{name:'Thử lại',exact:true}).click();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/10');await expect(page.getByRole('timer')).toHaveCount(0);
  await page.locator('.quiz-option').first().click();await page.getByRole('button',{name:'Tiếp theo →'}).click();await page.getByRole('button',{name:'← Câu trước'}).click();
  await expect(page.locator('.quiz-option input').first()).toBeChecked();
  await page.getByRole('button',{name:'Hoàn thành bài'}).click();await expect(page.getByRole('alertdialog')).toContainText('9 câu chưa trả lời');
  await expect(page.locator('.quiz-flashcard')).toBeVisible();await page.screenshot({path:test.info().outputPath('confirmation.png'),fullPage:false});
  await page.getByRole('button',{name:'Không, làm tiếp'}).click();expect(state.submissions).toBe(0);
  await page.getByRole('button',{name:'Hoàn thành bài'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Hoàn thành bài'}).click();await page.getByRole('button',{name:'Có, nộp bài'}).click();
  await expect(page.getByRole('heading',{name:'Hoàn thành bài trắc nghiệm!'})).toBeVisible();expect(state.submissions).toBe(1);
  await page.getByRole('button',{name:'Xem đáp án',exact:true}).click();await expect(page.locator('.quiz-explanation')).toContainText('Atomicity');
  await page.getByRole('button',{name:'Về Quiz Card',exact:true}).first().click();await expect(page.locator('.qc-quiz')).toContainText('1/10');await expect(page.locator('.qc-quiz')).toContainText('Đã làm 1 lần');
  await page.getByRole('button',{name:'Làm lại',exact:true}).click();await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/10');await expect(page.locator('.quiz-option input').first()).not.toBeChecked();
  await page.getByRole('button',{name:'Về Quiz Card',exact:true}).click();await page.locator('.qc-quiz summary').click();await page.getByRole('button',{name:'Đổi tên',exact:true}).click();await page.getByLabel('Tên mới').fill('Đề ôn tập CSDL');await page.getByRole('button',{name:'Lưu tên'}).click();
  await expect(page.getByRole('heading',{name:'Đề ôn tập CSDL'})).toBeVisible();
  await page.locator('.qc-quiz summary').click();await page.getByRole('button',{name:'Xóa',exact:true}).click();await page.getByRole('button',{name:'Xóa bài',exact:true}).click();await expect(page.locator('.qc-quiz')).toHaveCount(0);
});

test('100 questions remain reachable on mobile, timed quiz auto submits once',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await page.clock.install();
  const {a,state}=await setup(page,context);const dialog=await quizForm(page,a);
  await dialog.getByLabel('Số câu hỏi').fill('100');await dialog.getByLabel('Giới hạn thời gian',{exact:true}).check();
  await dialog.getByLabel('Số phút',{exact:true}).fill('0');await expect(dialog.getByRole('button',{name:'Tạo bài với Nova AI'})).toBeDisabled();
  await dialog.getByLabel('Số phút',{exact:true}).fill('1');await page.screenshot({path:test.info().outputPath('create-mobile.png'),fullPage:false});
  await dialog.getByRole('button',{name:'Tạo bài với Nova AI'}).click();await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 1/100');
  await page.getByRole('button',{name:'Đi đến câu 100',exact:true}).click();await expect(page.locator('.quiz-flashcard__header')).toContainText('CÂU HỎI 100/100');
  await page.getByRole('button',{name:'Đi đến câu 1',exact:true}).click();await page.locator('.quiz-option').first().click();
  await page.clock.runFor(62000);await expect(page.getByRole('heading',{name:'Hoàn thành bài trắc nghiệm!'})).toBeVisible();expect(state.submissions).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('AI flashcards use subject documents, persist progress, review subset, rename, delete',async({page,context})=>{
  const {a}=await setup(page,context);
  await page.route('**/api/flashcards/generate',async route=>{
    const data=route.request().postDataJSON();expect(data.subject_id).toBe(a.id);expect(data.document_ids.length).toBe(2);
    const response=await context.request.post('/api/flashcards',{data:{...data,subject:a.name,cards:[{id:'one',front:'Atomicity',back:'All or nothing'},{id:'two',front:'Isolation',back:'Concurrent transactions'}]}});
    return route.fulfill({status:201,json:await response.json()});
  });
  await page.getByRole('button',{name:'Tạo bộ Flashcard',exact:true}).first().click();const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('Chọn môn học trước để xem tài liệu của bạn.')).toBeVisible();await dialog.getByLabel('Môn học',{exact:true}).selectOption(String(a.id));
  await dialog.getByRole('button',{name:'Chọn tất cả',exact:true}).click();await dialog.getByLabel('Tên bộ Flashcard',{exact:true}).fill('Ôn giao dịch');await dialog.getByRole('button',{name:'Mint StudyHub',exact:true}).click();
  await dialog.getByRole('button',{name:'Tạo với Nova AI'}).click();await expect(page.getByRole('dialog',{name:'Ôn giao dịch'})).toBeVisible();
  await page.locator('.study-card').click();await page.getByRole('button',{name:'Đã nhớ',exact:true}).click();await expect(page.locator('.study-session-counter')).toContainText('Thẻ 2/2');
  await page.getByRole('button',{name:'Đóng phiên ôn tập'}).click();await page.reload();await expect(page.locator('.qc-recall')).toContainText('1 đã nhớ');
  await page.getByRole('button',{name:'Ôn lại',exact:true}).click();await page.getByRole('button',{name:/Ôn lại phần chưa nhớ/}).click();await expect(page.locator('.study-card')).toContainText('Isolation');await expect(page.locator('.study-session-counter')).toContainText('Thẻ 1/1');
  await page.locator('.study-card').click();await page.getByRole('button',{name:'Đã nhớ',exact:true}).click();await expect(page.getByRole('heading',{name:'Hoàn thành phiên ôn tập'})).toBeVisible();await page.getByRole('button',{name:'Đóng',exact:true}).click();
  expect((await (await context.request.get('/api/flashcards')).json())[0].cards.length).toBe(2);
  await page.getByRole('button',{name:'Ôn lại',exact:true}).click();await expect(page.getByRole('button',{name:/Ôn lại phần chưa nhớ/})).toBeDisabled();await page.getByRole('button',{name:'Đóng hộp thoại'}).click();
  await page.locator('.qc-deck summary').click();await page.getByRole('button',{name:'Đổi tên',exact:true}).click();await page.getByLabel('Tên mới').fill('CSDL đã nhớ');await page.getByRole('button',{name:'Lưu tên'}).click();
  await expect(page.getByRole('heading',{name:'CSDL đã nhớ'})).toBeVisible();await page.screenshot({path:test.info().outputPath('flashcard-list.png'),fullPage:true});
  await page.locator('.qc-deck summary').click();await page.getByRole('button',{name:'Xóa',exact:true}).click();await page.getByRole('button',{name:'Xóa bộ',exact:true}).click();await expect(page.locator('.qc-deck')).toHaveCount(0);expect(await (await context.request.get('/api/flashcards')).json()).toEqual([]);
});

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
test('document preview, persistence, colors, IPA, review, edit and mobile', async ({ browser }) => {
 const context=await browser.newContext();
 const base='http://127.0.0.1:5183';
 await context.request.post(base+'/api/auth/login',{data:{email:'student@studyhub.local',password:'Student123!'}});
 await context.request.post(base+'/api/auth/profile',{data:{first_name:'Test',last_name:'Student'}});
 for (const deck of await (await context.request.get(base+'/api/flashcards')).json()) await context.request.delete(base+'/api/flashcards/'+deck.id);
 const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/flashcards/pronunciation?*',route=>route.fulfill({json:{term:'important',pronunciation:'/ɪmˈpɔːrtənt/',audioUrl:''}}));
 await page.goto(base+'/app/quiz');
 await page.getByRole('button',{name:'Tạo Bộ Thẻ Mới'}).click();
 await page.getByLabel('Tự điền từ tài liệu').setInputFiles({name:'words.txt',mimeType:'text/plain',buffer:Buffer.from('important\nquan trọng\nLearn useful English words.')});
 await page.getByLabel('Tên bộ thẻ',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('input[maxlength="100"]')?.value==='important');
 await page.getByLabel('Tên bộ thẻ',{exact:true}).fill('E2E vocabulary');
 await page.getByLabel('Mô tả').fill('Edited suggestion');
 await page.getByLabel('Mặt trước',{exact:true}).fill('important');
 await page.getByLabel('Mặt sau').fill('quan trọng');
 await page.getByLabel('Ngôn ngữ',{exact:true}).selectOption('en');
 await page.getByRole('button',{name:'Tím',exact:true}).first().click();
 await page.getByRole('button',{name:'Đỏ',exact:true}).last().click();
 await page.reload();
 await page.getByRole('button',{name:'Tạo Bộ Thẻ Mới'}).click();
 assert.equal(await page.getByLabel('Tên bộ thẻ',{exact:true}).inputValue(),'E2E vocabulary');
 await page.getByRole('button',{name:'Lưu bộ thẻ',exact:true}).click();
 await page.getByRole('heading',{name:'E2E vocabulary'}).waitFor();
 await page.reload(); await page.getByRole('heading',{name:'E2E vocabulary'}).waitFor();
 const decks=await (await context.request.get(base+'/api/flashcards')).json();
 assert.equal(decks[0].color,'#a78bfa');assert.equal(decks[0].cards[0].color,'#fb7185');assert.equal(decks[0].description,'Edited suggestion');
 await page.getByRole('button',{name:'Bắt đầu ôn tập'}).click();
 await page.getByLabel('Phiên âm IPA').waitFor();
 assert.equal(await page.locator('.study-card').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(251, 113, 133)');
 await page.getByRole('button',{name:'Xanh lá',exact:true}).click();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.study-card')).borderTopColor==='rgb(74, 222, 128)');
 await page.locator('.study-card').click();await page.getByRole('button',{name:'Đã nhớ',exact:true}).click();
 await page.getByRole('heading',{name:'Hoàn thành phiên ôn tập'}).waitFor();
 assert.equal((await (await context.request.get(base+'/api/streak')).json()).current_streak,1);
 await page.getByRole('button',{name:'Đóng',exact:true}).click();
 await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
 await page.getByLabel('Tên bộ thẻ',{exact:true}).fill('Edited deck');await page.getByRole('button',{name:'Lưu bộ thẻ',exact:true}).click();
 await page.getByRole('heading',{name:'Edited deck'}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('heading',{name:'Edited deck'}).waitFor();
 await page.getByRole('button',{name:'Bắt đầu ôn tập'}).click();await page.getByLabel('Phiên âm IPA').waitFor();
 assert.equal(await page.locator('.study-card').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(74, 222, 128)');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:test.info().outputPath('mobile-flashcard.png'),fullPage:true});
 await page.getByRole('button',{name:'Đóng phiên ôn tập'}).click();
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Xóa bộ thẻ',exact:true}).click();
 await page.getByRole('heading',{name:'Edited deck'}).waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS: upload preview, edited metadata, draft reload, confirm save, DB persistence, deck/card colors, IPA, review/streak, edit, mobile, delete; no page errors');
 await context.close();
});

async function signIn(context, suffix) {
  const response = await context.request.post('/api/auth/register', { data: {
    first_name: 'QA', last_name: suffix, name: `QA ${suffix}`,
    email: `${suffix}-${Date.now()}@studyhub.test`, password: 'StudyHubTest123!',
  } });
  expect(response.status()).toBe(201);
}

async function seedDeck(context, extra = {}) {
  const response = await context.request.post('/api/flashcards', { data: {
    name: 'Audio fixture', color: '#38bdf8', cards: [
      { id: 'one', front: 'important', back: 'quan trọng', language: 'en', pronunciation: '/test/', audioUrl: 'https://api.dictionaryapi.dev/media/test.mp3' },
      { id: 'two', front: 'look up', back: 'tra cứu', language: 'en', pronunciation: '/lʊk ʌp/' },
      { id: 'three', front: 'qwertynotaword', back: 'Không có phiên âm', language: 'en' },
    ], ...extra,
  } });
  expect(response.status()).toBe(201);
  return response.json();
}

test('audio loading, pause, resume, replay, failure and switching cards', async ({ page, context }) => {
  await signIn(context, 'audio');
  await seedDeck(context);
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => {
    window.audioInstances=[];
    window.Audio=class {
      constructor() { this.pauses=0; window.audioInstances.push(this); }
      play() { if(window.rejectAudio) return Promise.reject(new Error('offline')); return Promise.resolve(); }
      pause() { this.pauses++; }
    };
  });
  await page.route('**/api/flashcards/pronunciation?*', route=>route.fulfill({json:{pronunciation:'',audioUrl:''}}));
  await page.goto('/app/quiz'); await page.getByRole('button',{name:'Bắt đầu ôn tập'}).click();
  await expect(page.getByLabel('Phiên âm IPA')).toHaveText('/test/');
  await page.getByRole('button',{name:'🔊 Phát âm tiếng Anh'}).click();
  await page.getByRole('button',{name:'⏸ Tạm dừng'}).click();
  await page.getByRole('button',{name:'▶ Tiếp tục'}).click();
  await page.evaluate(()=>window.audioInstances.at(-1).onended());
  await page.getByRole('button',{name:'🔊 Phát âm tiếng Anh'}).click();
  await page.getByRole('button',{name:'Thẻ sau →'}).click();
  expect(await page.evaluate(()=>window.audioInstances.at(-1).pauses)).toBeGreaterThan(0);
  await expect(page.getByLabel('Phiên âm IPA')).toHaveText('/lʊk ʌp/');
  await page.getByRole('button',{name:'← Thẻ trước'}).click();
  await page.evaluate(()=>window.rejectAudio=true);
  await page.getByRole('button',{name:'🔊 Phát âm tiếng Anh'}).click();
  await expect(page.getByRole('status')).toContainText('Không phát được âm thanh');
  await expect(page.getByLabel('Phiên âm IPA')).toHaveText('/test/');
  await page.locator('.study-card').click();
  await expect(page.locator('.study-card')).toContainText('quan trọng');
  expect(errors).toEqual([]);
});

test('slow audio times out and unavailable pronunciation preserves the card', async ({ page, context }) => {
  await signIn(context,'offline'); await seedDeck(context);
  await page.addInitScript(()=> { window.Audio=class { play(){return new Promise(()=>{});} pause(){} }; });
  await page.route('**/api/flashcards/pronunciation?*',route=>route.abort());
  await page.goto('/app/quiz'); await page.getByRole('button',{name:'Bắt đầu ôn tập'}).click();
  await page.getByRole('button',{name:'🔊 Phát âm tiếng Anh'}).click();
  await expect(page.getByRole('button',{name:'Đang tải âm thanh…'})).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Không phát được âm thanh',{timeout:12000});
  await page.getByRole('button',{name:'Thẻ sau →'}).click();
  await expect(page.locator('.study-card')).toContainText('look up');
  await expect(page.getByLabel('Phiên âm IPA')).toHaveText('/lʊk ʌp/');
  await page.getByRole('button',{name:'Thẻ sau →'}).click();
  await expect(page.getByLabel('Phiên âm IPA')).toHaveCount(0);
  await page.locator('.study-card').click();
  await expect(page.locator('.study-card')).toContainText('Không có phiên âm');
});

test('streak fire follows zero, one, two and threshold; reduced motion is respected', async ({ page, context }) => {
  await signIn(context,'streak');
  let count=0;
  await page.route('**/api/streak',route=>route.fulfill({json:{current_streak:count,fire_level:Math.min(count,3),today:'2026-09-30',activity_dates:[],last_activity_date:null,recovery_count:0}}));
  for (const level of [0,1,2,5]) {
    count=level; await page.goto('/dashboard');
    const fire=page.locator(`.streak-symbol.fire-level-${Math.min(level,3)}`).first();
    await expect(fire).toBeVisible();
    expect(await fire.evaluate(element=>getComputedStyle(element).animationName)).toBe(level?'studyFire':'none');
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.streak-symbol').first().evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
});

test('AI preview stays editable, errors preserve draft, unchanged confirmation persists', async ({ page, context }) => {
  await signIn(context,'preview');
  await page.goto('/app/quiz'); await page.getByRole('button',{name:'Tạo Bộ Thẻ Mới'}).click();
  let status=200;
  const suggestion={id:'suggested',name:'AI title',subject:'English',description:'AI description',keywords:['word'],difficulty:'intermediate',color:'#38bdf8',cover:'plain',cards:[{id:'ai-card',front:'word',back:'từ',language:'en',pronunciation:'/wɜːd/'}]};
  await page.route('**/api/flashcards/preview',route=>route.fulfill({status,json:status===200?{suggestion,warning:''}:{error:'AI unavailable'}}));
  const file={name:'sample.txt',mimeType:'text/plain',buffer:Buffer.from('word: từ')};
  await page.getByLabel('Tự điền từ tài liệu').setInputFiles(file);
  await expect(page.getByLabel('Tên bộ thẻ',{exact:true})).toHaveValue('AI title');
  expect(await (await context.request.get('/api/flashcards')).json()).toEqual([]);
  await page.getByRole('button',{name:'Lưu bộ thẻ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI title'})).toBeVisible();
  const stored=(await (await context.request.get('/api/flashcards')).json())[0];
  expect(stored.description).toBe(suggestion.description);expect(stored.keywords).toEqual(suggestion.keywords);
  await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
  await page.getByLabel('Mô tả',{exact:true}).fill('My own description');
  status=503; page.once('dialog',dialog=>dialog.accept());
  await page.getByLabel('Tự điền từ tài liệu').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('AI unavailable');
  await expect(page.getByLabel('Mô tả',{exact:true})).toHaveValue('My own description');
  await page.getByRole('button',{name:'Lưu bộ thẻ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI title'})).toBeVisible();
  const edited=(await (await context.request.get('/api/flashcards')).json())[0];
  expect(edited.name).toBe(stored.name);expect(edited.cards).toEqual(stored.cards);expect(edited.description).toBe('My own description');
});

test('every palette color persists and cards without an override inherit the deck', async ({ page, context }) => {
  await signIn(context,'palette');
  const deck=await seedDeck(context,{name:'Palette',cards:[{id:'inherit',front:'Term',back:'Definition'}]});
  await page.goto('/app/quiz'); await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
  await page.getByRole('button',{name:'Cam',exact:true}).first().click();
  await page.getByRole('button',{name:'Lưu bộ thẻ',exact:true}).click();
  await page.getByRole('button',{name:'Bắt đầu ôn tập'}).click();
  await expect(page.locator('.study-card')).toHaveCSS('border-top-color','rgb(251, 146, 60)');
  for(const [name,color,rgb] of [
    ['Xanh lam','#38bdf8','rgb(56, 189, 248)'],['Tím','#a78bfa','rgb(167, 139, 250)'],
    ['Đỏ','#fb7185','rgb(251, 113, 133)'],['Cam','#fb923c','rgb(251, 146, 60)'],
    ['Xanh lá','#4ade80','rgb(74, 222, 128)'],['Vàng','#facc15','rgb(250, 204, 21)'],['Tối','#64748b','rgb(100, 116, 139)'],
  ]) {
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.locator('.study-card')).toHaveCSS('border-top-color',rgb);
    const stored=(await (await context.request.get('/api/flashcards')).json()).find(item=>item.id===deck.id);
    expect(stored.cards[0].color).toBe(color);
  }
  await page.getByRole('button',{name:'Đóng phiên ôn tập'}).click();
  await page.reload(); await page.getByRole('button',{name:'Bắt đầu ôn tập'}).click();
  await expect(page.locator('.study-card')).toHaveCSS('border-top-color','rgb(100, 116, 139)');
});

test('library upload suggests a content title and saves user edits', async ({ page, context }) => {
  await signIn(context,'library-title');
  const subject = await context.request.post('/api/subjects',{data:{code:'OOP',name:'Lập trình Java'}});
  expect(subject.status()).toBe(201);
  await page.goto('/app/materials');
  await page.getByRole('button',{name:'Upload tài liệu mới'}).click();
  await page.locator('#upload-file').setInputFiles({name:'scan001.txt',mimeType:'text/plain',buffer:Buffer.from('[PAGE:1]\nTRƯỜNG ĐẠI HỌC ABC\n# Chương 2: Lập trình hướng đối tượng\nKế thừa và đa hình trong Java.')});
  await expect(page.locator('#upload-title')).toHaveValue('Chương 2: Lập trình hướng đối tượng');
  await expect(page.getByRole('status')).toContainText('Tên được trích');
  expect(await (await context.request.get('/api/documents')).json()).toEqual([]);
  await page.locator('#upload-title').fill('Java OOP — tài liệu ôn thi');
  await page.getByRole('button',{name:'Tải lên & Xử lý'}).click();
  await expect(page.getByRole('heading',{name:'Tải lên Tài liệu Mới'})).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Java OOP — tài liệu ôn thi',exact:true})).toBeVisible();
  const documents=await (await context.request.get('/api/documents')).json();
  expect(documents[0].title).toBe('Java OOP — tài liệu ôn thi');
});

test('library suggestions never overwrite typing or a more recently selected file', async ({page,context})=>{
  await signIn(context,'library-race');
  await page.goto('/app/materials');await page.getByRole('button',{name:'Upload tài liệu mới'}).click();
  let pending=[];
  await page.route('**/api/documents/preview',route=>{pending.push(route);});
  const file=name=>({name,mimeType:'text/plain',buffer:Buffer.from('Sample content')});
  await page.locator('#upload-file').setInputFiles(file('first.txt'));
  await expect.poll(()=>pending.length).toBe(1);
  await page.locator('#upload-title').fill('Tên tự nhập');
  await page.locator('#upload-description').fill('Mô tả tự nhập');
  await pending[0].fulfill({json:{suggestion:{title:'Gợi ý AI',description:'Mô tả AI'},warning:''}});
  await expect(page.getByRole('button',{name:'Dùng tên gợi ý'})).toBeVisible();
  await expect(page.locator('#upload-title')).toHaveValue('Tên tự nhập');
  await expect(page.locator('#upload-description')).toHaveValue('Mô tả tự nhập');
  await page.getByRole('button',{name:'Dùng tên gợi ý'}).click();
  await page.locator('#upload-file').setInputFiles(file('second.txt'));await expect.poll(()=>pending.length).toBe(2);
  await page.locator('#upload-file').setInputFiles(file('third.txt'));await expect.poll(()=>pending.length).toBe(3);
  await pending[2].fulfill({json:{suggestion:{title:'Tài liệu mới nhất',description:'Nội dung mới'},warning:''}});
  await expect(page.locator('#upload-title')).toHaveValue('Tài liệu mới nhất');
  await pending[1].fulfill({json:{suggestion:{title:'Kết quả cũ',description:'Nội dung cũ'},warning:''}}).catch(()=>{});
  await expect(page.locator('#upload-title')).toHaveValue('Tài liệu mới nhất');
  await expect(page.locator('#upload-description')).toHaveValue('Mô tả tự nhập');
});

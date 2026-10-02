import json
import sqlite3
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import test_quiz_generation as generation
import test_server_integration as integration
from backend.app.quizzes import service
from backend.app.flashcards import service as flashcards


class QuizRedesignUnitTests(unittest.TestCase):
    def test_limits_and_difficulty(self):
        for words, expected in [(10,20),(800,50),(3000,100)]:
            self.assertEqual(service.content_limits([{'text':'word ' * words}])['max_questions'],expected)
        engine=generation.QuizGenerationTests().engine()
        for difficulty,level in [('easy','understand'),('medium','apply'),('hard','analyze')]:
            result=service.generate([{'id':1,'title':'x','text':'Atomicity ensures that a transaction is fully rolled back.'}],3,engine,difficulty)
            self.assertTrue(all(q['difficulty']==level for q in result))

    def test_legacy_deck_metadata_and_theme_roundtrip(self):
        payload={'id':'old','name':'Legacy','cards':[{'id':'1','front':'A','back':'B','remembered':True}],'color':'#a78bfa'}
        old=flashcards.normalize_deck(payload)
        self.assertEqual(old['color'],'#a78bfa');self.assertTrue(old['cards'][0]['remembered'])
        modern=flashcards.normalize_deck({**old,'subject_id':9,'document_ids':[1,2],'color':'var(--primary-pink)'})
        self.assertEqual(modern['subject_id'],9);self.assertEqual(modern['document_ids'],[1,2]);self.assertTrue(modern['cards'][0]['remembered'])


class QuizRedesignHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): generation.QuizHTTPTests.setUpClass.__func__(cls)
    @classmethod
    def tearDownClass(cls): generation.QuizHTTPTests.tearDownClass.__func__(cls)
    def setUp(self):
        for name in ('request','login_cookie','create_subject'):
            setattr(self,name,getattr(integration.ServerIntegrationTest,name).__get__(self))
        self.cookie=self.login_cookie('student@studyhub.local','Student123!')
        self.other=self.login_cookie('teacher@studyhub.local','Teacher123!')
        self.headers={'Cookie':self.cookie}
        self.subject=self.create_subject(self.cookie,'QRS')['id']

    def upload(self, subject=None, words=150):
        boundary='RedesignUpload'
        text='Atomicity ensures all operations complete or roll back together. ' * words
        data=(f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nTransactions\r\n'
              f'--{boundary}\r\nContent-Disposition: form-data; name="subject_id"\r\n\r\n{subject or self.subject}\r\n'
              f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="source.txt"\r\nContent-Type: text/plain\r\n\r\n{text}\r\n--{boundary}--\r\n').encode()
        status,_,doc=self.request('/api/upload','POST',data,{**self.headers,'Content-Type':f'multipart/form-data; boundary={boundary}'})
        self.assertEqual(status,201,doc)
        return doc['document_id']

    def test_subject_limits_and_access(self):
        first=self.upload(words=1)
        another_subject=self.create_subject(self.cookie,'QRA')['id'];second=self.upload(another_subject)
        source={'subject_id':self.subject,'document_ids':[first]}
        status,_,limits=self.request('/api/quizzes/limits','POST',source,self.headers)
        self.assertEqual(status,200,limits);self.assertEqual(limits['max_questions'],20)
        for count in [21,100,101,120,0,-1,True,'10',None,1.5]:
            status,_,error=self.request('/api/quizzes/generate','POST',{**source,'question_count':count},self.headers)
            self.assertEqual(status,400,(count,error))
        for endpoint in ['/api/quizzes/limits','/api/quizzes/generate','/api/flashcards/generate']:
            status,_,error=self.request(endpoint,'POST',{**source,'document_ids':[first,second],'question_count':1},self.headers)
            self.assertEqual(status,400,error)
            status,_,error=self.request(endpoint,'POST',{**source,'question_count':1},{'Cookie':self.other})
            self.assertEqual(status,404,error)
        status,_,docs=self.request(f'/api/documents?subject_id={self.subject}',headers=self.headers)
        self.assertTrue(all(d['subject_id']==self.subject for d in docs))

    def test_flashcard_generation_review_rename_and_delete(self):
        doc=self.upload()
        payload={'subject_id':self.subject,'document_ids':[doc],'name':'Transaction cards','requested_count':10,'color':'var(--secondary-mint)'}
        status,_,deck=self.request('/api/flashcards/generate','POST',payload,self.headers)
        self.assertEqual(status,201,deck);self.assertEqual(len(deck['cards']),10);self.assertEqual(deck['subject_id'],self.subject)
        status,_,review=self.request(f"/api/flashcards/{deck['id']}/review",'POST',{'card_id':deck['cards'][0]['id'],'rating':'known'},self.headers)
        self.assertEqual(status,200,review)
        status,_,renamed=self.request(f"/api/flashcards/{deck['id']}/rename",'POST',{'name':'Renamed'},self.headers)
        self.assertEqual(status,200,renamed);self.assertTrue(renamed['cards'][0]['remembered'])
        status,_,rows=self.request('/api/flashcards',headers=self.headers)
        saved=next(row for row in rows if row['id']==deck['id']);self.assertEqual(saved['name'],'Renamed');self.assertTrue(saved['cards'][0]['remembered'])
        for path,method,body in [(f"/api/flashcards/{deck['id']}/rename",'POST',{'name':'intruder'}),(f"/api/flashcards/{deck['id']}",'DELETE',None)]:
            self.assertEqual(self.request(path,method,body,{'Cookie':self.other})[0],404)
        self.assertEqual(self.request(f"/api/flashcards/{deck['id']}",'DELETE',headers=self.headers)[0],200)
        self.assertFalse(any(row['id']==deck['id'] for row in self.request('/api/flashcards',headers=self.headers)[2]))

    def test_timer_secure_submit_attempts_rename_retake_delete(self):
        doc=self.upload()
        status,_,quiz=self.request('/api/quizzes/generate','POST',{'subject_id':self.subject,'document_ids':[doc],'question_count':2,'difficulty':'hard','time_limit':1},self.headers)
        self.assertEqual(status,201,quiz);self.assertTrue(all(q['difficulty']=='analyze' for q in quiz['questions']))
        prefix=f"/api/quizzes/{quiz['id']}"
        self.assertEqual(self.request(prefix+'/submit','POST',{'answers':{}},self.headers)[0],400)
        status,_,run=self.request(prefix+'/start','POST',{},self.headers);self.assertEqual(status,200,run)
        with sqlite3.connect(Path(self.tmp.name)/'integration.db') as c:
            definition=json.loads(c.execute("SELECT content FROM chat_messages WHERE session_id=? AND role='assistant'",(quiz['id'],)).fetchone()[0])
        correct=definition['questions'][0]['correct_index']
        self.assertEqual(self.request(prefix+'/answers','POST',{'run_id':run['run_id'],'revision':2,'answers':{'q1':correct}},self.headers)[0],200)
        # A stale autosave cannot replace a newer answer snapshot.
        self.request(prefix+'/answers','POST',{'run_id':run['run_id'],'revision':1,'answers':{}},self.headers)
        with sqlite3.connect(Path(self.tmp.name)/'integration.db') as c:
            content=json.loads(c.execute('SELECT content FROM chat_messages WHERE id=?',(run['run_id'],)).fetchone()[0])
            content['started_at']=time.time()-61;content['deadline']=content['started_at']+60
            c.execute('UPDATE chat_messages SET content=? WHERE id=?',(json.dumps(content),run['run_id']))
        status,_,result=self.request(prefix+'/submit','POST',{'run_id':run['run_id'],'answers':{'q1':(correct+1)%4},'score':999,'duration':1},self.headers)
        self.assertEqual(status,200,result);self.assertEqual(result['score'],1);self.assertEqual(result['duration'],60)
        repeated=self.request(prefix+'/submit','POST',{'run_id':run['run_id'],'answers':{}},self.headers)[2]
        self.assertEqual(result['attempt_id'],repeated['attempt_id'])
        second_run=self.request(prefix+'/start','POST',{},self.headers)[2]
        self.assertNotEqual(second_run['run_id'],run['run_id'])
        self.request(prefix+'/submit','POST',{'run_id':second_run['run_id'],'answers':{}},self.headers)
        status,_,renamed=self.request(prefix+'/rename','POST',{'name':'Exam renamed'},self.headers)
        self.assertEqual(status,200,renamed)
        item=next(item for item in self.request('/api/quizzes/history',headers=self.headers)[2]['items'] if item['id']==quiz['id'])
        self.assertEqual(item['title'],'Exam renamed');self.assertEqual(len(item['attempts']),2);self.assertEqual(item['attempts'][0]['score'],0)
        for suffix,method,body in [('/start','POST',{}),('/rename','POST',{'name':'bad'}),('/answers','POST',{'run_id':run['run_id'],'revision':3,'answers':{}}),('','DELETE',None)]:
            self.assertEqual(self.request(prefix+suffix,method,body,{'Cookie':self.other})[0],404)
        self.assertEqual(self.request(prefix,'DELETE',headers=self.headers)[0],200)
        self.assertEqual(self.request(prefix,headers=self.headers)[0],404)
        with sqlite3.connect(Path(self.tmp.name)/'integration.db') as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM chat_messages WHERE session_id=?',(quiz['id'],)).fetchone()[0],0)

class ManualLearningHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): integration.ServerIntegrationTest.setUpClass.__func__(cls)
    @classmethod
    def tearDownClass(cls): integration.ServerIntegrationTest.tearDownClass.__func__(cls)
    def setUp(self):
        for name in ('request','login_cookie','create_subject'):
            setattr(self,name,getattr(integration.ServerIntegrationTest,name).__get__(self))
        self.cookie=self.login_cookie('student@studyhub.local','Student123!')
        self.headers={'Cookie':self.cookie}
        self.subject=self.create_subject(self.cookie,'MAN')['id']

    def test_manual_creation_grading_validation_and_ownership(self):
        question={'question':'2 + 2?', 'options':['1','2','3','4'], 'correct_index':3}
        payload={'subject_id':self.subject,'title':'Tự tạo','questions':[question],'time_limit':0}
        status,_,quiz=self.request('/api/quizzes/manual','POST',payload,self.headers)
        self.assertEqual(status,201,quiz)
        self.assertNotIn('correct_index',quiz['questions'][0])
        self.assertEqual(quiz['document_ids'],[])
        prefix=f"/api/quizzes/{quiz['id']}"
        status,_,run=self.request(prefix+'/start','POST',{},self.headers)
        self.assertEqual(status,200,run)
        status,_,result=self.request(prefix+'/submit','POST',{'run_id':run['run_id'],'answers':{'q1':3}},self.headers)
        self.assertEqual(status,200,result);self.assertEqual(result['score'],1)
        cards={'subject_id':self.subject,'name':'Thẻ tự tạo','cards':[{'front':'Hỏi','back':'Đáp'}]}
        status,_,deck=self.request('/api/flashcards/manual','POST',cards,self.headers)
        self.assertEqual(status,201,deck);self.assertEqual(deck['document_ids'],[])
        saved=self.request('/api/flashcards',headers=self.headers)[2]
        self.assertTrue(any(row['id']==deck['id'] for row in saved))
        for patch in [{'questions':[]},{'questions':[question]*101},{'title':' '},{'time_limit':True},{'subject_id':True}]:
            self.assertEqual(self.request('/api/quizzes/manual','POST',{**payload,**patch},self.headers)[0],400)
        for patch in [{'question':''},{'options':['A','a','C','D']},{'correct_index':True},{'correct_index':4},{'options':['A']}]:
            self.assertEqual(self.request('/api/quizzes/manual','POST',{**payload,'questions':[{**question,**patch}]},self.headers)[0],400)
        other=self.login_cookie('teacher@studyhub.local','Teacher123!')
        for endpoint,body in [('/api/quizzes/manual',payload),('/api/flashcards/manual',cards)]:
            self.assertEqual(self.request(endpoint,'POST',body,{'Cookie':other})[0],404)
        self.assertEqual(self.request('/api/flashcards/manual','POST',{**cards,'cards':[{'front':'','back':'B'}]},self.headers)[0],400)

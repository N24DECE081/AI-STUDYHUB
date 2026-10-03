import concurrent.futures
import json
import sqlite3
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import test_server_integration as integration
from backend.app import study
from backend.app.db.mysql import MySQLDatabase
from backend.app.security.service import update_streak
from backend.app.timezone import VIETNAM_TZ


class ProgressSyncTests(unittest.TestCase):
    request = integration.ServerIntegrationTest.request
    create_subject = integration.ServerIntegrationTest.create_subject

    @classmethod
    def setUpClass(cls): integration.ServerIntegrationTest.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls): integration.ServerIntegrationTest.tearDownClass.__func__(cls)

    def setUp(self):
        self.email = f'progress-{time.time_ns()}@studyhub.test'
        status, headers, account = self.request('/api/auth/register', 'POST', {
            'first_name': 'Progress', 'last_name': 'QA', 'email': self.email, 'password': 'StudyHubTest123!'
        })
        self.assertEqual(status, 201, account)
        self.user_id = account['user']['id']
        self.headers = {'Cookie': headers['Set-Cookie'].split(';')[0]}
        self.subject = self.create_subject(self.headers['Cookie'], 'PR')['id']
        status, _, self.quiz = self.request('/api/quizzes/manual', 'POST', {
            'subject_id': self.subject, 'title': 'Progress quiz',
            'questions': [{'question': f'Câu {i}: 2 + 2 = ?', 'options': ['1','2','3','4'], 'correct_index': 3} for i in range(5)],
        }, self.headers)
        self.assertEqual(status, 201, self.quiz)

    def start(self, **payload):
        status, _, run = self.request('/api/quiz-attempts', 'POST', {'quizId': self.quiz['id'], **payload}, self.headers)
        self.assertEqual(status, 201, run)
        return run

    def test_answers_resume_server_grading_and_concurrent_idempotent_submit(self):
        run = self.start(idempotencyKey='start-one')
        self.assertEqual(run['attemptId'], self.start(idempotencyKey='start-one')['attemptId'])
        prefix = f'/api/quiz-attempts/{run["attemptId"]}'
        answers = {'q1': 3, 'q2': 3, 'q3': 3, 'q4': 0, 'q5': 0}
        status, _, result = self.request(prefix + '/answers', 'POST', {'answers': answers, 'revision': 1, 'isCorrect': True}, self.headers)
        self.assertEqual(status, 200, result)
        status, _, summary = self.request('/api/progress/summary', headers=self.headers)
        self.assertEqual((summary['questions_answered'], summary['correct_answers'], summary['accuracy_percent']), (5,3,60))
        resumed = self.start(resume=True, idempotencyKey='resume-one')
        self.assertEqual(resumed['attemptId'], run['attemptId']); self.assertEqual(resumed['answers'], answers)
        self.request(prefix + '/answers', 'POST', {'answers': {'q1':0}, 'revision': 1}, self.headers)
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: self.request(prefix + '/submit', 'POST', {'correctCount': 999, 'scorePercent': 100}, self.headers), range(2)))
        for status, _, result in results:
            self.assertEqual(status, 200, result); self.assertEqual(result['score'], 3); self.assertEqual(result['scorePercent'], 60)
        self.assertEqual(results[0][2], results[1][2])
        self.assertEqual(self.start(resume=True, idempotencyKey='resume-one')['attemptId'], run['attemptId'])
        _, _, summary = self.request('/api/progress/summary', headers=self.headers)
        self.assertEqual((summary['xp'], summary['streak'], summary['learning_percent']), (35,1,80))
        _, _, tasks = self.request('/api/progress/today-tasks', headers=self.headers)
        self.assertEqual(tasks['questions_answered'], 5)
        for range_name, count in [('7d',7),('8w',8),('6m',6)]:
            status, _, timeline = self.request('/api/progress/timeline?range='+range_name, headers=self.headers)
            self.assertEqual(status, 200); self.assertEqual(len(timeline['points']), count)
            self.assertEqual(timeline['points'][-1]['questions_answered'], 5)
        with sqlite3.connect(Path(self.tmp.name) / 'integration.db') as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM quiz_answers WHERE attempt_id=?', (run['attemptId'],)).fetchone()[0], 5)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM study_events WHERE user_id=? AND type='quiz_submit'", (self.user_id,)).fetchone()[0], 1)
        status, headers, _ = self.request('/api/auth/register', 'POST', {
            'first_name':'Other', 'last_name':'Account', 'email':f'other-{time.time_ns()}@studyhub.test', 'password':'StudyHubTest123!',
        })
        other = {'Cookie': headers['Set-Cookie'].split(';')[0]}
        for path, method, payload in [(prefix,'GET',None),(prefix+'/answers','POST',{'answers':answers}),(prefix+'/submit','POST',{}),('/api/quiz-attempts','POST',{'quizId':self.quiz['id']})]:
            self.assertEqual(self.request(path, method, payload, other)[0], 404)
        self.assertEqual(self.request('/api/progress/summary', headers=other)[2]['questions_answered'], 0)
        self.assertEqual(self.request('/api/progress/summary')[0], 401)
        self.assertEqual(self.request('/api/progress/timeline?range=invalid', headers=self.headers)[0], 422)
        self.assertEqual(self.request('/api/quiz-attempts','POST',{'quizId':True},self.headers)[0],422)

    def test_review_history_idempotency_and_timestamp_survive_deck_edit(self):
        status, _, deck = self.request('/api/flashcards/manual','POST',{'subject_id':self.subject,'name':'Reviews','cards':[{'front':'A','back':'A back'},{'front':'B','back':'B back'}]},self.headers)
        self.assertEqual(status,201,deck)
        for index, card in enumerate(deck['cards']):
            path = f'/api/flashcards/{card["id"]}/review'
            payload = {'deckId':deck['id'],'result':'remembered','idempotencyKey':f'review-{index}'}
            first = self.request(path,'POST',payload,self.headers)
            second = self.request(path,'POST',payload,self.headers)
            self.assertEqual(first[0],200,first[2]); self.assertEqual(first[2]['reviewId'],second[2]['reviewId'])
            deck = second[2]['deck']
        at = deck['cards'][0]['rememberedAt']
        self.assertTrue(at.endswith('Z'))
        deck['cards'][0]['rememberedAt']='2099-01-01T00:00:00Z'; deck['cards'][0]['remembered']=False
        status, _, edited = self.request('/api/flashcards','POST',deck,self.headers)
        self.assertEqual(status,200,edited); self.assertEqual(edited['cards'][0]['rememberedAt'],at)
        self.assertTrue(edited['cards'][0]['remembered'])
        _, _, summary = self.request('/api/progress/summary',headers=self.headers)
        self.assertEqual((summary['cards_remembered'],summary['deck_count'],summary['xp'],summary['streak']),(2,1,10,1))
        self.assertEqual(self.request('/api/progress/today-tasks',headers=self.headers)[2]['cards_remembered'],2)
        self.assertEqual(self.request(f'/api/flashcards/{deck["cards"][0]["id"]}/review','POST',{'deckId':deck['id'],'result':'invalid'},self.headers)[0],422)
        _, _, older=self.request(f'/api/flashcards/{deck["cards"][0]["id"]}/review','POST',{
            'deckId':deck['id'],'result':'not_remembered','occurredAt':(datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat(),
        },self.headers)
        self.assertTrue(older['deck']['cards'][0]['remembered'])  # A delayed offline action cannot undo a newer review.

    def test_utc_day_buckets_streak_gap_and_idle_clock(self):
        run = self.start()
        self.request(f'/api/quiz-attempts/{run["attemptId"]}/answers','POST',{'answers':{'q1':3}},self.headers)
        with sqlite3.connect(Path(self.tmp.name) / 'integration.db') as conn:
            conn.row_factory=sqlite3.Row
            conn.execute('UPDATE quiz_answers SET answered_at=? WHERE attempt_id=?',('2026-10-02 17:00:00',run['attemptId']))
            conn.execute('DELETE FROM user_activity_days WHERE user_id=?',(self.user_id,))
            conn.execute('INSERT INTO user_activity_days(user_id,activity_date) VALUES(?,?)',(self.user_id,'2026-10-01'))
            conn.execute('INSERT INTO user_activity_days(user_id,activity_date) VALUES(?,?)',(self.user_id,'2026-10-03'))
            now=datetime(2026,10,3,1,tzinfo=VIETNAM_TZ)
            with patch('backend.app.security.service.vietnam_now',return_value=now):
                report=study.analytics(conn,self.user_id,now)
                self.assertEqual(report['today']['questions_answered'],1)
                self.assertEqual(report['ranges']['day'][-2]['questions_answered'],0)
                self.assertEqual(update_streak(conn,self.user_id)['current_streak'],1)
            start=datetime(2026,10,3,2,tzinfo=timezone.utc)
            study.heartbeat(conn,self.user_id,'clock',start)
            study.heartbeat(conn,self.user_id,'other-device',start)
            study.heartbeat(conn,self.user_id,'clock',start+timedelta(seconds=30))
            study.heartbeat(conn,self.user_id,'other-device',start+timedelta(seconds=30))
            self.assertEqual(study.study_time(conn,self.user_id)['total_seconds'],30)
            study.heartbeat(conn,self.user_id,'clock',start+timedelta(days=2))
            self.assertEqual(study.study_time(conn,self.user_id,'clock')['current_session_seconds'],30)
        status, _, result=self.request('/api/study-time',headers=self.headers)
        self.assertEqual(status,200); self.assertLess(result['current_session_seconds'],60)

    def test_mysql_schema_has_portable_timestamps_and_indexes(self):
        sql='\n'.join(MySQLDatabase._mysql_statements())
        for field in ('submitted_at','answered_at','reviewed_at'):
            self.assertIn(field+' DATETIME',sql)
        self.assertIn('ix_study_events_user_created',sql)

    def test_timed_offline_answers_keep_pre_deadline_action_time(self):
        status,_,quiz=self.request('/api/quizzes/manual','POST',{'subject_id':self.subject,'title':'Timed offline','time_limit':1,
            'questions':[{'question':'2+2?','options':['1','2','3','4'],'correct_index':3}]},self.headers)
        self.assertEqual(status,201,quiz)
        _,_,run=self.request('/api/quiz-attempts','POST',{'quizId':quiz['id']},self.headers)
        now=time.time()
        with sqlite3.connect(Path(self.tmp.name) / 'integration.db') as conn:
            row=conn.execute('SELECT content FROM chat_messages WHERE id=?',(run['run_id'],)).fetchone()
            legacy=json.loads(row[0]);legacy.update(started_at=now-61,deadline=now-1)
            conn.execute('UPDATE chat_messages SET content=? WHERE id=?',(json.dumps(legacy),run['run_id']))
            conn.execute('UPDATE quiz_attempts SET started_at=? WHERE id=?',(study.stamp(datetime.fromtimestamp(now-61,timezone.utc)),run['attemptId']))
        path=f'/api/quiz-attempts/{run["attemptId"]}'
        status,_,saved=self.request(path+'/answers','POST',{'answers':{'q1':3},'occurredAt':datetime.fromtimestamp(now-10,timezone.utc).isoformat()},self.headers)
        self.assertEqual(status,200,saved);self.assertTrue(saved['saved'])
        # A new answer after the deadline still cannot replace the recorded answer.
        self.assertTrue(self.request(path+'/answers','POST',{'answers':{'q1':0}},self.headers)[2]['expired'])
        result=self.request(path+'/submit','POST',{},self.headers)[2]
        self.assertEqual(result['score'],1);self.assertEqual(result['duration'],60)

    def test_nova_legacy_message_and_roadmap_choice_share_durable_progress(self):
        with sqlite3.connect(Path(self.tmp.name) / 'integration.db') as conn:
            plan=conn.execute("SELECT id FROM plans WHERE name='Premium'").fetchone()[0]
            conn.execute('DELETE FROM subscriptions WHERE user_id=?',(self.user_id,))
            conn.execute("INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,'active')",(self.user_id,plan))
            conversation=conn.execute("INSERT INTO tutor_conversations(user_id,title,mode) VALUES(?,'Legacy Nova','qa')",(self.user_id,)).lastrowid
            message=conn.execute("INSERT INTO tutor_messages(conversation_id,role,content,payload) VALUES(?,'assistant','Quiz',?)",
                (conversation,json.dumps({'topic':'Legacy Nova','questions':[{'question':'2+2?','options':['1','2','3','4'],'answer_index':3}]}))).lastrowid
            roadmap=conn.execute("INSERT INTO tutor_roadmaps(user_id,subject,goal,difficulty,title,payload) VALUES(?,'Math','Practice','beginner','Math','{}')",(self.user_id,)).lastrowid
            exercise=conn.execute("""INSERT INTO tutor_exercises(roadmap_id,user_id,module_key,lesson_key,topic,exercise_type,difficulty,prompt,options,expected_answer)
                VALUES(?,?,'m1','l1','Math','multiple_choice','beginner','2+2?',?,'4')""",(roadmap,self.user_id,json.dumps(['1','2','3','4']))).lastrowid
        status,_,run=self.request('/api/quiz-attempts','POST',{'tutorMessageId':str(message),'resume':True},self.headers)
        self.assertEqual(status,201,run)
        self.assertEqual(self.request(f'/api/quiz-attempts/{run["attemptId"]}/submit','POST',{'answers':{'q1':3}},self.headers)[2]['score'],1)
        status,_,run=self.request('/api/quiz-attempts','POST',{'tutorExerciseId':exercise,'resume':True},self.headers)
        self.assertEqual(status,201,run)
        self.request(f'/api/quiz-attempts/{run["attemptId"]}/answers','POST',{'answers':{'q1':3}},self.headers)
        prefix=f'/api/ai-tutor/exercises/{exercise}/submit'
        payload={'attemptId':run['attemptId'],'answer':'4','answer_type':'choice'}
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda _:self.request(prefix,'POST',payload,self.headers),range(2)))
        self.assertEqual(results[0][0],201,results[0][2]);self.assertEqual(results[1][0],201,results[1][2])
        self.assertEqual(results[0][2]['submission_id'],results[1][2]['submission_id'])
        summary=self.request('/api/progress/summary',headers=self.headers)[2]
        self.assertEqual((summary['questions_answered'],summary['accuracy_percent'],summary['xp']),(2,100,30))
        with sqlite3.connect(Path(self.tmp.name) / 'integration.db') as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM tutor_submissions WHERE exercise_id=?',(exercise,)).fetchone()[0],1)

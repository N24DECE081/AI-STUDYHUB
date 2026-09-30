import sqlite3
import unittest

from backend.app.ai_tutor import memory, repository
from backend.app.ai_tutor.roadmap import build_assessment_questions


class AITutorAcceptanceTests(unittest.TestCase):
    def test_subject_assessments_are_short_and_distinct(self):
        payloads = [
            {'subject': 'Java', 'topics': ['OOP']},
            {'subject': 'Giải tích', 'topics': ['Giới hạn', 'Đạo hàm']},
            {'subject': 'Tiếng Anh IELTS', 'topics': ['Speaking']},
        ]
        banks = [build_assessment_questions(payload) for payload in payloads]
        for bank in banks:
            self.assertGreaterEqual(len(bank), 3)
            self.assertLessEqual(len(bank), 5)
        prompts = [' '.join(item['prompt'] for item in bank) for bank in banks]
        self.assertIn('Java', prompts[0])
        self.assertIn('Giới hạn', prompts[1])
        self.assertIn('tiếng Anh', prompts[2])
        self.assertEqual(len(set(prompts)), 3)

    def test_vietnamese_preference_intents_with_and_without_accents(self):
        cases = {
            'Từ giờ gọi bạn là Cún Cưng nhé.': ('assistant_name', 'Cún Cưng'),
            'Dat biet danh cho chatbot la cuncung': ('assistant_name', 'cuncung'),
            'Gọi tôi là Minh.': ('user_name', 'Minh'),
            'Đổi biệt danh của bạn thành Gia Sư.': ('assistant_name', 'Gia Sư'),
            'Giai thich ngan hon': ('response_style', 'concise'),
        }
        for text, expected in cases.items():
            detected = memory.chat_preference(text)
            self.assertIsNotNone(detected, text)
            self.assertEqual((detected['slot'], detected['value']), expected)

    def test_history_delete_is_scoped_to_owner(self):
        connection = sqlite3.connect(':memory:')
        connection.row_factory = sqlite3.Row
        connection.executescript('''
            PRAGMA foreign_keys=ON;
            CREATE TABLE tutor_conversations(
              id INTEGER PRIMARY KEY, user_id INTEGER, client_key TEXT, title TEXT,
              mode TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE tutor_messages(
              id INTEGER PRIMARY KEY, conversation_id INTEGER REFERENCES tutor_conversations(id) ON DELETE CASCADE,
              role TEXT, content TEXT, mode TEXT, payload TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO tutor_conversations(id,user_id,client_key,title,mode) VALUES
              (1,10,'mine','Mine','explain'),(2,20,'other','Other','explain');
            INSERT INTO tutor_messages(conversation_id,role,content) VALUES (1,'user','x'),(2,'user','y');
        ''')
        self.assertFalse(repository.delete_conversation(connection, 10, 'other'))
        self.assertEqual(repository.delete_conversations(connection, 10), 1)
        self.assertEqual(connection.execute('SELECT COUNT(*) FROM tutor_conversations WHERE user_id=20').fetchone()[0], 1)
        self.assertEqual(connection.execute('SELECT COUNT(*) FROM tutor_messages WHERE conversation_id=1').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()

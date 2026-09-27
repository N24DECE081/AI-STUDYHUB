"""Tests for the StudyHub website-consultation chatbot (web_assistant).

Hai hợp đồng chính:
- Mọi thông tin StudyHub phải lấy từ tài liệu tổng hợp (knowledge.ENTRIES), không bịa.
- Không có API key: câu ngoài StudyHub bị từ chối lịch sự. Có API key: câu ngoài StudyHub
  được trả lời bằng kiến thức chung, có ghi chú rõ, và ngữ cảnh gửi mô hình không chứa
  dữ liệu StudyHub (giá/tính năng) để không gán bừa.
"""

import os
import unittest
from unittest import mock

os.environ.setdefault('STUDYHUB_NO_DOTENV', '1')
os.environ['STUDYHUB_AI_PROVIDER'] = 'local'  # ép chạy offline, không gọi mạng

from backend.app import web_assistant  # noqa: E402
from backend.app.ai_tutor import config as ai_config  # noqa: E402
from backend.app.web_assistant import assistant as wa_engine  # noqa: E402
from backend.app.web_assistant import knowledge  # noqa: E402


class WebsiteQuestionsTest(unittest.TestCase):
    def ask(self, question):
        return web_assistant.ask(question, client_ip='test')

    def test_pricing_question_is_answered_from_document(self):
        result = self.ask('Học phí của StudyHub là bao nhiêu?')
        self.assertTrue(result['in_scope'])
        self.assertIn('199.000', result['answer'])
        self.assertIn('299.000', result['answer'])
        self.assertEqual(result['topic'], 'Bảng giá 3 gói StudyHub')

    def test_free_plan_limits_are_answered(self):
        result = self.ask('Gói miễn phí 0đ có gì?')
        self.assertTrue(result['in_scope'])
        self.assertIn('5 tài liệu', result['answer'])
        self.assertIn('10 câu/ngày', result['answer'])

    def test_nova_tutor_question_is_answered(self):
        result = self.ask('Nova AI Tutor làm được gì?')
        self.assertTrue(result['in_scope'])
        self.assertEqual(result['topic'], 'Nova AI Tutor')

    def test_unrelated_question_is_refused_offline(self):
        result = self.ask('Thời tiết Hà Nội hôm nay thế nào?')
        self.assertFalse(result['in_scope'])
        self.assertEqual(result['answer'], knowledge.OUT_OF_SCOPE_ANSWER)

    def test_same_keyword_out_of_context_question_is_refused(self):
        """'giá' xuất hiện trong tài liệu nhưng câu hỏi này không phải về StudyHub."""
        result = self.ask('Giá vàng hôm nay bao nhiêu?')
        self.assertFalse(result['in_scope'])

    def test_greeting_does_not_reach_document_search(self):
        result = self.ask('xin chào')
        self.assertFalse(result['in_scope'])
        self.assertIn('Nova', result['answer'])

    def test_gibberish_asks_for_a_clearer_question(self):
        result = self.ask('asdkjhaskdjh')
        self.assertFalse(result['in_scope'])
        self.assertEqual(result['answer'], knowledge.NEED_QUESTION_ANSWER)

    def test_empty_message_asks_for_a_question(self):
        self.assertEqual(self.ask('   ')['answer'], knowledge.NEED_QUESTION_ANSWER)

    def test_offline_engine_is_used_without_provider_key(self):
        result = self.ask('Thanh toán bằng ví điện tử nào?')
        self.assertTrue(result['in_scope'])
        self.assertEqual(result['engine'], 'knowledge')

    def test_long_message_is_truncated_not_rejected(self):
        result = self.ask('Học phí? ' + 'a' * 900)
        self.assertIn('answer', result)


class DifferentiatorQuestionTest(unittest.TestCase):
    """Câu 'bạn có gì đặc biệt' luôn trả lời bằng mục điểm khác biệt của StudyHub."""

    def test_special_feature_question_maps_to_differentiators_entry(self):
        result = web_assistant.ask('StudyHub có gì đặc biệt?', client_ip='test')
        self.assertTrue(result['in_scope'])
        self.assertEqual(result['topic'], 'StudyHub có gì đặc biệt')
        self.assertIn('đặc biệt', result['answer'])

    def test_compare_with_other_apps_maps_to_differentiators_entry(self):
        result = web_assistant.ask('StudyHub khác gì app khác thế?', client_ip='test')
        self.assertTrue(result['in_scope'])
        self.assertEqual(result['topic'], 'StudyHub có gì đặc biệt')

    def test_pitch_entries_exist_in_knowledge(self):
        ids = {entry['id'] for entry in knowledge.ENTRIES}
        for identifier in knowledge.PITCH_ENTRY_IDS:
            with self.subTest(identifier=identifier):
                self.assertIn(identifier, ids)


class ModelAnswerTest(unittest.TestCase):
    """Có API key: Nova trả lời linh hoạt và biết trả lời cả câu hỏi ngoài StudyHub."""

    SETTINGS = {
        'provider': 'test',
        'api_key': 'test-key',
        'base_url': 'http://127.0.0.1:9',
        'model': 'test-model',
    }

    def ask_with_model(self, question, answer='Câu trả lời linh hoạt', ip='model-test'):
        with mock.patch.object(ai_config, 'provider_settings', return_value=self.SETTINGS), \
                mock.patch.object(wa_engine, '_compose_with_model', return_value=answer) as compose:
            result = web_assistant.ask(question, client_ip=ip)
        return result, compose

    def test_capability_question_is_answered_by_model_from_pitch_context(self):
        result, compose = self.ask_with_model('Bạn có gì đặc biệt?')
        self.assertEqual(result['answer'], 'Câu trả lời linh hoạt')
        self.assertEqual(result['engine'], 'ai')
        context = compose.call_args.kwargs['context']
        self.assertIn('StudyHub có gì đặc biệt', context)
        self.assertIn('Nova AI Tutor', context)

    def test_general_question_is_answered_as_general_knowledge(self):
        result, compose = self.ask_with_model('Thời tiết Hà Nội hôm nay thế nào?')
        self.assertFalse(result['in_scope'])
        self.assertEqual(result['mode'], 'general')
        self.assertEqual(result['engine'], 'ai-general')
        kwargs = compose.call_args.kwargs
        self.assertEqual(kwargs['context_label'], web_assistant.GENERAL_LABEL)
        # Ngữ cảnh câu hỏi chung KHÔNG được chứa dữ liệu StudyHub (giá, con số) để mô hình khỏi gán bừa.
        self.assertNotIn('199.000', kwargs['context'])
        self.assertIn(knowledge.GENERAL_NOTE, kwargs['prompt'])

    def test_studyhub_question_model_receives_document_context(self):
        result, compose = self.ask_with_model('Học phí bao nhiêu?')
        self.assertTrue(result['in_scope'])
        self.assertEqual(result['engine'], 'ai')
        kwargs = compose.call_args.kwargs
        self.assertEqual(kwargs['context_label'], web_assistant.STUDYHUB_LABEL)
        self.assertIn('199.000', kwargs['context'])

    def test_greeting_is_answered_by_model_not_by_template(self):
        result, compose = self.ask_with_model('xin chào')
        self.assertEqual(result['engine'], 'ai')
        self.assertEqual(result['answer'], 'Câu trả lời linh hoạt')
        self.assertEqual(result['mode'], 'small_talk')

    def test_model_failure_falls_back_to_offline_answer(self):
        with mock.patch.object(ai_config, 'provider_settings', return_value=self.SETTINGS), \
                mock.patch.object(wa_engine, '_compose_with_model', return_value=None):
            result = web_assistant.ask('Học phí bao nhiêu?', client_ip='model-test')
        self.assertEqual(result['engine'], 'knowledge')
        self.assertIn('199.000', result['answer'])


class StarterPayloadTest(unittest.TestCase):
    def test_starters_payload_shape(self):
        payload = web_assistant.starters()
        self.assertEqual(payload['name'], knowledge.ASSISTANT_NAME)
        self.assertEqual(payload['greeting'], knowledge.GREETING)
        self.assertEqual(len(payload['starters']), 4)

    def test_every_starter_maps_to_knowledge(self):
        """Mỗi gợi ý nhanh phải trả lời được, không được rơi vào câu từ chối."""
        for starter in knowledge.STARTERS:
            with self.subTest(starter=starter):
                result = web_assistant.ask(starter, client_ip='test')
                self.assertTrue(result['in_scope'], starter)


class KnowledgeIntegrityTest(unittest.TestCase):
    def test_entries_have_required_fields(self):
        identifiers = set()
        for entry in knowledge.ENTRIES:
            self.assertTrue(entry['title'])
            self.assertTrue(entry['keywords'])
            self.assertTrue(entry['answer'])
            self.assertNotIn(entry['id'], identifiers)
            identifiers.add(entry['id'])

    def test_keywords_are_diacritic_insensitive_matchable(self):
        """Từ khoá phải khớp được câu hỏi không dấu của người dùng."""
        result = web_assistant.ask('hoc phi bao nhieu tien', client_ip='test')
        self.assertTrue(result['in_scope'])

    def test_small_talk_kinds_have_offline_answers(self):
        for kind, answer in knowledge.SMALL_TALK_ANSWERS.items():
            with self.subTest(kind=kind):
                self.assertTrue(answer)


if __name__ == '__main__':
    unittest.main()

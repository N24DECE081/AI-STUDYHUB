"""Chatbot tư vấn StudyHub cho khách trên trang chủ.

Mọi thông tin StudyHub lấy từ tài liệu tổng hợp của nhóm (bảng giá, Story Map, Value
Proposition Canvas, Business Model Canvas) trong `knowledge.py` — mô hình không được bịa
thêm. Câu hỏi ngoài StudyHub: có API key thì trả lời bằng kiến thức chung (ghi chú rõ),
không có key thì từ chối lịch sự.
"""

from .assistant import GENERAL_LABEL, STUDYHUB_LABEL, ask, starters
from . import knowledge

__all__ = ['GENERAL_LABEL', 'STUDYHUB_LABEL', 'ask', 'knowledge', 'starters']

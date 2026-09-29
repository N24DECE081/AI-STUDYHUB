# AI StudyHub expert layers

Trạng thái bên dưới phân biệt code đã tích hợp với dịch vụ cần cấu hình để chạy thật. Đây là orchestration và memory/RAG, không phải fine-tuning model.

| Tầng | Cấu hình | Đã tích hợp | Điều kiện để chạy thật |
| --- | --- | --- |
| Model routing | `apps/python-api/data/settings/model_catalog.json` | Chat và structured JSON task có thể dùng model riêng | Cần provider và key hợp lệ; model catalog chỉ chọn model, không cấp quyền truy cập |
| Knowledge/RAG | `apps/python-api/data/settings/knowledge.yaml` | Trích xuất đoạn tài liệu theo trang, xếp hạng từ khóa, ưu tiên nguồn độc lập và cộng điểm khi nhiều từ khóa cùng xuất hiện | Cần người dùng upload tài liệu. Đây chưa phải LightRAG/GraphRAG production engine |
| Expert skill | `apps/python-api/skills/professional_tutor.md` | Được chèn vào prompt cho provider LLM | Cần provider LLM; deterministic offline engine không thực thi skill dạng prompt |
| Long-term memory | `apps/python-api/data/settings/memory.yaml` | L1 lịch sử, L2 facts và L3 profile riêng từng user | Cần database có lưu trữ bền vững ở production |
| Agent tools | `apps/python-api/data/settings/agents.yaml` | RAG, calculator AST giới hạn và Wikipedia search khi yêu cầu rõ ràng; có trace | Web cần outbound network. Không chạy Python/shell tùy ý và không trả chain-of-thought |

## Cấu hình model đang thực sự hoạt động

Python API hỗ trợ hai model. Đặt các giá trị sau trong `apps/python-api/.env` (không commit API key):

```dotenv
STUDYHUB_AI_PROVIDER=openai
STUDYHUB_AI_API_KEY=your-key-here
STUDYHUB_AI_BASE_URL=https://api.openai.com/v1
STUDYHUB_AI_MODEL=gpt-4o
STUDYHUB_AI_TASK_MODEL=gpt-4o-mini
```

## Kiểm tra trạng thái runtime

1. Khởi động backend và gọi `GET /api/ai-tutor/engine` để xác nhận provider/model thật đang dùng.
2. Upload tài liệu qua ứng dụng và hỏi một nội dung có trong tài liệu để kiểm tra local-RAG.
3. Gọi `GET /api/ai-tutor/memory` sau một số lượt học để kiểm tra hồ sơ L3 của tài khoản hiện tại.

## Giới hạn và trạng thái deploy

Graph-RAG hiện dùng đồ thị đồng xuất hiện từ khóa cục bộ, không phụ thuộc dịch vụ vector bên ngoài. Web search chỉ chạy khi câu hỏi yêu cầu tìm web rõ ràng. `exec` chỉ hỗ trợ biểu thức số học qua AST sandbox và không chạy lệnh hệ điều hành. Production cần API key và kho tài liệu phù hợp; Render Free không phù hợp để lưu trữ dữ liệu thật vì filesystem tạm thời và service có thể spin down. Xem mục deploy trong `README.md`.

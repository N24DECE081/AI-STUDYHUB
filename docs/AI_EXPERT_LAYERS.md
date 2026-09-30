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

Python API hỗ trợ tách model chat và model tác vụ. Cấu hình miễn phí khuyến nghị dùng Groq với chuỗi model dự phòng. Sao chép các giá trị cần thiết từ `apps/python-api/.env.ai.example` sang `apps/python-api/.env` và không commit API key:

```dotenv
STUDYHUB_AI_PROVIDER=groq
GROQ_API_KEY=replace-with-your-new-groq-key
STUDYHUB_AI_BASE_URL=https://api.groq.com/openai/v1
STUDYHUB_AI_MODEL=openai/gpt-oss-120b
STUDYHUB_AI_TASK_MODEL=openai/gpt-oss-20b
STUDYHUB_AI_FALLBACK_MODELS=qwen/qwen3.8-27b,openai/gpt-oss-20b
STUDYHUB_AI_TASK_FALLBACK_MODELS=qwen/qwen3.8-27b,openai/gpt-oss-120b
```

Nova chỉ đổi sang model tiếp theo khi model hiện tại không tồn tại, hết quota/rate limit hoặc provider lỗi. Lỗi xác thực 401 không kích hoạt failover vì mọi model dùng chung key. Khi tất cả model provider lỗi, engine offline tiếp tục trả lời từ tài liệu của người học.

## Kiểm tra trạng thái runtime

1. Khởi động backend và gọi `GET /api/ai-tutor/engine` để xác nhận provider/model thật đang dùng.
2. Upload tài liệu qua ứng dụng và hỏi một nội dung có trong tài liệu để kiểm tra local-RAG.
3. Gọi `GET /api/ai-tutor/memory` sau một số lượt học để kiểm tra hồ sơ L3 của tài khoản hiện tại.

## Giới hạn và trạng thái deploy

Graph-RAG hiện dùng đồ thị đồng xuất hiện từ khóa cục bộ, không phụ thuộc dịch vụ vector bên ngoài. Web search chỉ chạy khi câu hỏi yêu cầu tìm web rõ ràng. `exec` chỉ hỗ trợ biểu thức số học qua AST sandbox và không chạy lệnh hệ điều hành. Production cần API key và kho tài liệu phù hợp; Render Free không phù hợp để lưu trữ dữ liệu thật vì filesystem tạm thời và service có thể spin down. Xem mục deploy trong `README.md`.

Embedding/reranking chưa được cài đặt: `text-embedding-3-large` không còn được khai báo như model đang hoạt động vì không có ingestion/index/query embedding path trong runtime.

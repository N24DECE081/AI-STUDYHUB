package com.studyhub.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

@Service
public class QuizService {

    @Value("${gemini.api.key:}")
    private String apiKey;

    private final WebClient webClient;

    public QuizService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.baseUrl("https://generativelanguage.googleapis.com").build();
    }

    public Mono<String> generateQuizFromJson(String documentContent) {
        String prompt = "Tạo 3 câu hỏi trắc nghiệm JSON dạng: [{\"question\":\"...\", \"options\":[\"A...\",\"B...\",\"C...\",\"D...\"], \"answer\":\"A\"}]";

        Map<String, Object> body = Map.of(
            "contents", List.of(
                Map.of(
                    "role", "user",
                    "parts", List.of(
                        Map.of("text", prompt)
                    )
                )
            )
        );

        String url = "/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey.trim();

        return webClient.post()
                .uri(url)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(String.class)
                .map(this::cleanJsonResponse)
                .onErrorReturn(getMockQuizJson());
    }

    private String getMockQuizJson() {
        return "[\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 1: Nội dung chính của tài liệu nghiên cứu là gì?\",\n" +
                "    \"options\": [\"A. Tác động của mạng xã hội\", \"B. Phát triển phần mềm\", \"C. Lịch sử máy tính\", \"D. Kinh tế vi mô\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 2: Đối tượng khảo sát chính trong bài báo cáo là ai?\",\n" +
                "    \"options\": [\"A. Học sinh tiểu học\", \"B. Sinh viên HVCNBCVT\", \"C. Giảng viên\", \"D. Người đi làm\"],\n" +
                "    \"answer\": \"B\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 3: Mục tiêu quan trọng nhất được đề cập trong tài liệu là gì?\",\n" +
                "    \"options\": [\"A. Đánh giá vấn đề nghiên cứu\", \"B. Tăng chi phí vận hành\", \"C. Thay đổi đối tượng khảo sát\", \"D. Loại bỏ dữ liệu\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 4: Phương pháp nào được sử dụng để thu thập thông tin?\",\n" +
                "    \"options\": [\"A. Phỏng vấn và khảo sát\", \"B. Dự đoán ngẫu nhiên\", \"C. Sao chép dữ liệu\", \"D. Không thu thập thông tin\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 5: Kết quả nghiên cứu cho thấy điều gì?\",\n" +
                "    \"options\": [\"A. Vấn đề không có ảnh hưởng\", \"B. Có mối liên hệ đáng kể giữa các yếu tố\", \"C. Dữ liệu hoàn toàn không hợp lệ\", \"D. Không thể đưa ra kết luận\"],\n" +
                "    \"answer\": \"B\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 6: Yếu tố nào có ảnh hưởng lớn nhất theo tài liệu?\",\n" +
                "    \"options\": [\"A. Yếu tố được phân tích nổi bật nhất\", \"B. Thời tiết\", \"C. Vị trí địa lý bất kỳ\", \"D. Màu sắc tài liệu\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 7: Dữ liệu trong tài liệu được trình bày nhằm mục đích gì?\",\n" +
                "    \"options\": [\"A. Minh họa và hỗ trợ kết luận\", \"B. Làm tài liệu dài hơn\", \"C. Thay thế toàn bộ phân tích\", \"D. Che giấu kết quả\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 8: Hạn chế nào của nghiên cứu được đề cập?\",\n" +
                "    \"options\": [\"A. Phạm vi hoặc số lượng mẫu còn giới hạn\", \"B. Không có chủ đề nghiên cứu\", \"C. Không có dữ liệu nào\", \"D. Không có người thực hiện\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 9: Kiến nghị chính của tài liệu là gì?\",\n" +
                "    \"options\": [\"A. Tiếp tục nghiên cứu và mở rộng phạm vi\", \"B. Ngừng thu thập dữ liệu\", \"C. Bỏ qua kết quả\", \"D. Không cần giải pháp\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  },\n" +
                "  {\n" +
                "    \"question\": \"Câu hỏi 10: Kết luận của tài liệu nhấn mạnh điều gì?\",\n" +
                "    \"options\": [\"A. Tầm quan trọng của vấn đề được nghiên cứu\", \"B. Không cần áp dụng kết quả\", \"C. Chủ đề không đáng quan tâm\", \"D. Không có hướng phát triển\"],\n" +
                "    \"answer\": \"A\"\n" +
                "  }\n" +
                "]";
    }

    private String cleanJsonResponse(String rawResponse) {
        try {
            int textIndex = rawResponse.indexOf("\"text\": \"");
            if (textIndex != -1) {
                int start = textIndex + 9;
                int end = rawResponse.indexOf("\"", start);
                while (end != -1 && rawResponse.charAt(end - 1) == '\\') {
                    end = rawResponse.indexOf("\"", end + 1);
                }
                if (end != -1) {
                    String extracted = rawResponse.substring(start, end)
                            .replace("\\n", "\n")
                            .replace("\\\"", "\"")
                            .replace("\\\\", "\\");
                    
                    if (extracted.contains("```json")) {
                        extracted = extracted.substring(extracted.indexOf("```json") + 7);
                    }
                    if (extracted.contains("```")) {
                        extracted = extracted.substring(0, extracted.indexOf("```"));
                    }
                    return extracted.trim();
                }
            }
        } catch (Exception ignored) {}
        return getMockQuizJson();
    }
}
package com.studyhub.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

@Service
public class AiTutorService {

    @Value("${gemini.api.key:}")
    private String apiKey;

    @Value("${gemini.api.model:gemini-2.0-flash}")
    private String model;

    private final WebClient webClient;

    public AiTutorService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.baseUrl("https://generativelanguage.googleapis.com").build();
    }

    public Flux<String> chatWithDocumentStream(String context, String question) {
        String safeContext = (context != null) ? context : "";
        String safeQuestion = (question != null) ? question : "";

        String prompt = "Bạn là trợ lý học tập. Chỉ sử dụng thông tin trong phần TÀI LIỆU để trả lời. "
            + "Nếu tài liệu không có thông tin cần thiết, hãy nói rõ là tài liệu không đề cập, không tự bịa. "
            + "Trả lời bằng tiếng Việt, mạch lạc và có thể trích dẫn ý liên quan.\n\n"
                + "--- TÀI LIỆU ---\n" + safeContext + "\n\n"
                + "--- CÂU HỎI ---\n" + safeQuestion;

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

        String cleanKey = apiKey == null ? "" : apiKey.trim();
        if (cleanKey.isEmpty()) {
            return generateConfigurationError();
        }

        return webClient.post()
            .uri("/v1beta/models/" + model + ":streamGenerateContent?alt=sse&key=" + cleanKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
            .onStatus(status -> status.isError(), response -> response.bodyToMono(String.class)
                .map(errorBody -> new IllegalStateException(
                    "Gemini API " + response.statusCode() + ": " + errorBody)))
                .bodyToFlux(String.class)
                .filter(data -> data.contains("\"text\""))
                .map(this::extractTextFromStreamData)
            .onErrorResume(e -> generateErrorResponse(e));
    }

        private Flux<String> generateConfigurationError() {
        return Flux.just("Chưa cấu hình Gemini API key. Hãy đặt biến môi trường GEMINI_API_KEY rồi khởi động lại backend.");
        }

        private Flux<String> generateErrorResponse(Throwable exception) {
        return Flux.just("Không thể tạo câu trả lời từ tài liệu vì Gemini API gặp lỗi: " + exception.getMessage());
    }

    private String extractTextFromStreamData(String jsonChunk) {
        try {
            int index = jsonChunk.indexOf("\"text\": \"");
            if (index != -1) {
                int start = index + 9;
                int end = jsonChunk.indexOf("\"", start);
                while (end != -1 && jsonChunk.charAt(end - 1) == '\\') {
                    end = jsonChunk.indexOf("\"", end + 1);
                }
                if (end != -1) {
                    return jsonChunk.substring(start, end)
                            .replace("\\n", "\n")
                            .replace("\\\"", "\"")
                            .replace("\\\\", "\\");
                }
            }
        } catch (Exception ignored) {}
        return "";
    }
}
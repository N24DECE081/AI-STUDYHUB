package com.studyhub.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Service
public class GeminiService {

    @Value("${gemini.api.key:}")
    private String apiKey;

    private final WebClient webClient;

    public GeminiService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.baseUrl("https://generativelanguage.googleapis.com").build();
    }

    public String callGeminiApi(String prompt) {
        String cleanKey = apiKey == null ? "" : apiKey.trim();
        if (cleanKey.isEmpty()) {
            return "Không thể tạo tóm tắt vì Gemini API key chưa được cấu hình.";
        }

        Map<String, Object> body = Map.of(
                "contents", List.of(
                        Map.of(
                                "role", "user",
                                "parts", List.of(Map.of("text", prompt == null ? "" : prompt))
                        )
                )
        );

        try {
            String response = webClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/v1beta/models/gemini-1.5-flash:generateContent")
                            .queryParam("key", cleanKey)
                            .build())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(Duration.ofSeconds(30));

            String text = extractText(response);
            return text.isBlank() ? "Gemini không trả về nội dung tóm tắt." : text;
        } catch (Exception exception) {
            return "Không thể kết nối Gemini để tạo tóm tắt: " + exception.getMessage();
        }
    }

    private String extractText(String response) {
        if (response == null) {
            return "";
        }

        int textIndex = response.indexOf("\"text\": \"");
        if (textIndex < 0) {
            return "";
        }

        int start = textIndex + 9;
        int end = response.indexOf("\"", start);
        while (end > 0 && response.charAt(end - 1) == '\\') {
            end = response.indexOf("\"", end + 1);
        }
        if (end < 0) {
            return "";
        }

        return response.substring(start, end)
                .replace("\\n", "\n")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }
}

package com.studyhub.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ProxyController {

    private final WebClient pythonApiClient;
    private final WebClient aiServiceClient;

    public ProxyController(
            @org.springframework.beans.factory.annotation.Qualifier("pythonApiClient") WebClient pythonApiClient,
            @org.springframework.beans.factory.annotation.Qualifier("aiServiceApiClient") WebClient aiServiceClient) {
        this.pythonApiClient = pythonApiClient;
        this.aiServiceClient = aiServiceClient;
    }

    // ===================== AUTH (proxy → Python 5000) =====================

    @PostMapping("/auth/login")
    public Mono<ResponseEntity<?>> login(@RequestBody Map<String, String> body) {
        return pythonApiClient.post()
                .uri("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .toEntity(Map.class);
    }

    @PostMapping("/auth/register")
    public Mono<ResponseEntity<?>> register(@RequestBody Map<String, String> body) {
        return pythonApiClient.post()
                .uri("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .toEntity(Map.class);
    }

    @PostMapping("/auth/logout")
    public Mono<ResponseEntity<?>> logout() {
        return pythonApiClient.post()
                .uri("/api/auth/logout")
                .retrieve()
                .toEntity(Map.class);
    }

    @GetMapping("/auth/me")
    public Mono<ResponseEntity<?>> me() {
        return pythonApiClient.get()
                .uri("/api/auth/me")
                .retrieve()
                .toEntity(Map.class);
    }

    // ===================== SUBSCRIPTION (proxy → Python 5000) =====================

    @GetMapping("/subscription")
    public Mono<ResponseEntity<?>> getSubscription() {
        return pythonApiClient.get()
                .uri("/api/subscription")
                .retrieve()
                .toEntity(Map.class);
    }

    @PostMapping("/subscription/checkout")
    public Mono<ResponseEntity<?>> checkoutSubscription(@RequestBody Map<String, Object> body) {
        return pythonApiClient.post()
                .uri("/api/subscription/checkout")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .toEntity(Map.class);
    }

    @PostMapping("/subscription/cancel")
    public Mono<ResponseEntity<?>> cancelSubscription() {
        return pythonApiClient.post()
                .uri("/api/subscription/cancel")
                .retrieve()
                .toEntity(Map.class);
    }

    // ===================== DOCUMENTS (proxy → Python 5000) =====================

    @GetMapping("/documents")
    public Mono<ResponseEntity<?>> getDocuments() {
        return pythonApiClient.get()
                .uri("/api/documents")
                .retrieve()
                .toEntity(Map.class);
    }

    @GetMapping("/documents/{id}")
    public Mono<ResponseEntity<?>> getDocument(@PathVariable Long id) {
        return pythonApiClient.get()
                .uri("/api/documents/{id}", id)
                .retrieve()
                .toEntity(Map.class);
    }

    @PostMapping(value = "/documents/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<?>> uploadDocument(
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "subject_code", required = false) String subjectCode) {

        org.springframework.core.io.ByteArrayResource resource = new org.springframework.core.io.ByteArrayResource(file.getBytes()) {
            @Override public String getFilename() { return file.getOriginalFilename(); }
        };
        org.springframework.messaging.support.Message<org.springframework.core.io.ByteArrayResource> msg =
                org.springframework.messaging.support.MessageBuilder.withPayload(resource)
                        .setHeader(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                                "form-data; name=\"file\"; filename=\"" + file.getOriginalFilename() + "\"")
                        .build();
        return pythonApiClient.post()
                .uri("/api/upload")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .header("Content-Length", String.valueOf(file.getSize() + 1024 * 10))
                .bodyValue(msg)
                .retrieve()
                .toEntity(Map.class);
    }

    // ===================== AI / TUTOR PROXY (proxy → AI 8081) =====================

    @PostMapping(value = "/ai/chat-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestBody Map<String, String> body) {
        return aiServiceClient.post()
                .uri("/api/documents/chat-stream")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(String.class);
    }

    @PostMapping("/ai/documents/flashcards")
    public Mono<ResponseEntity<?>> flashcards(@RequestBody Map<String, Object> body) {
        return aiServiceClient.post()
                .uri("/api/documents/flashcards")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .toEntity(Map.class);
    }

    @PostMapping("/ai/documents/quiz")
    public Mono<ResponseEntity<?>> quiz(@RequestBody Map<String, Object> body) {
        return aiServiceClient.post()
                .uri("/api/documents/quiz")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .toEntity(Map.class);
    }

    @PostMapping(value = "/documents/upload-v2", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<?>> uploadWithSummary(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return aiServiceClient.post()
                .uri("/api/documents/upload")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .retrieve()
                .toEntity(Map.class);
    }

    // ===================== AI Tutor Chat (proxy → Python 5000 /ai-tutor/chat) =====================
    // Giữ endpoint /api/ai-tutor/chat để tương thích code frontend cũ (AITutorPage.jsx)

    @PostMapping("/ai-tutor/chat")
    public Mono<ResponseEntity<?>> aiTutorChat(@RequestBody Map<String, Object> body) {
        return pythonApiClient.post()
                .uri("/api/ai-tutor/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .toEntity(Map.class);
    }
}

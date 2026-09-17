package com.studyhub.controller;

import com.studyhub.service.AiTutorService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@CrossOrigin(origins = "*")
public class AiTutorController {

    private final AiTutorService aiTutorService;

    public AiTutorController(AiTutorService aiTutorService) {
        this.aiTutorService = aiTutorService;
    }

    @PostMapping(value = "/chat-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatWithDocumentStream(@RequestBody Map<String, String> request) {
        String context = request.get("context");
        String question = request.get("question");
        return aiTutorService.chatWithDocumentStream(context, question);
    }
}
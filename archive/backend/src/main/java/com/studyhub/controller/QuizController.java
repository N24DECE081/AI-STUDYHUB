package com.studyhub.controller;

import com.studyhub.service.QuizService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Map;

@RestController
@RequestMapping("/api/quiz")
@CrossOrigin(origins = "*")
public class QuizController {

    private final QuizService quizService;

    public QuizController(QuizService quizService) {
        this.quizService = quizService;
    }

    @PostMapping("/generate")
    public Mono<ResponseEntity<String>> generateQuiz(@RequestBody Map<String, String> request) {
        String documentId = request.get("documentId");
        String content = request.get("content");
        
        return quizService.generateQuizFromJson(content != null ? content : documentId)
                .map(ResponseEntity::ok)
                .defaultIfEmpty(ResponseEntity.badRequest().body("[]"));
    }
}
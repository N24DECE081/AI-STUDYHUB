package com.studyhub.controller;

import com.studyhub.model.ChatMessageModel;
import com.studyhub.model.DocumentModel;
import com.studyhub.repository.ChatMessageRepository;
import com.studyhub.repository.DocumentRepository;
import com.studyhub.service.AiTutorService;
import com.studyhub.service.DocumentService;
import com.studyhub.service.GeminiService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/documents")
@CrossOrigin(origins = "*")
public class DocumentController {

    private final DocumentService documentService;
    private final AiTutorService aiTutorService;
    private final DocumentRepository documentRepository;
    private final ChatMessageRepository chatMessageRepository;

    @Autowired(required = false)
    private GeminiService geminiService;

    public DocumentController(DocumentService documentService,
                              AiTutorService aiTutorService,
                              DocumentRepository documentRepository,
                              ChatMessageRepository chatMessageRepository) {
        this.documentService = documentService;
        this.aiTutorService = aiTutorService;
        this.documentRepository = documentRepository;
        this.chatMessageRepository = chatMessageRepository;
    }

    // 1. Lấy tất cả danh sách tài liệu từ CSDL
    @GetMapping
    public ResponseEntity<List<DocumentModel>> getAllDocuments() {
        return ResponseEntity.ok(documentRepository.findAllByOrderByIdDesc());
    }

    // 2. Upload tài liệu, xử lý và lưu vào CSDL
    @PostMapping("/upload")
    public ResponseEntity<?> uploadDocument(@RequestParam("file") MultipartFile file) {
        try {
            DocumentModel doc = documentService.processAndSaveDocument(file);
            documentRepository.save(doc);
            return ResponseEntity.ok(doc);
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Lỗi xử lý tài liệu: " + e.getMessage());
        }
    }

    // 3. Tóm tắt trực tiếp nội dung file PDF bằng Gemini API
    @PostMapping("/summarize")
    public ResponseEntity<?> summarizePDF(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "File tải lên không được rỗng"));
        }

        try {
            // Đọc văn bản từ file PDF
            PDDocument document = PDDocument.load(file.getInputStream());
            PDFTextStripper stripper = new PDFTextStripper();
            String extractedText = stripper.getText(document);
            document.close();

            // Giới hạn độ dài chuỗi ký tự gửi API
            if (extractedText.length() > 8000) {
                extractedText = extractedText.substring(0, 8000);
            }

            // Câu lệnh Prompt tóm tắt
            String prompt = "Bạn là một trợ lý học tập. Hãy đọc nội dung bài giảng sau và tóm tắt ngắn gọn 3 đến 5 ý chính quan trọng nhất bằng tiếng Việt (dạng gạch đầu dòng):\n\n" + extractedText;

            // Gọi Gemini API lấy kết quả
            String aiSummary = (geminiService != null) 
                    ? geminiService.callGeminiApi(prompt)
                    : "GeminiService chưa được tiêm phụ thuộc.";

            return ResponseEntity.ok(Map.of(
                "filename", file.getOriginalFilename(),
                "summary", aiSummary
            ));

        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Lỗi xử lý file PDF: " + e.getMessage()));
        }
    }

    // 4. Lấy lịch sử tin nhắn chat của 1 tài liệu
    @GetMapping("/{documentId}/messages")
    public ResponseEntity<List<ChatMessageModel>> getChatHistory(@PathVariable Long documentId) {
        return ResponseEntity.ok(chatMessageRepository.findByDocumentIdOrderByCreatedAtAsc(documentId));
    }

    // 5. Chat Stream câu hỏi về tài liệu thời gian thực (Server-Sent Events / SSE)
    @PostMapping(value = "/chat-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestBody Map<String, Object> request) {
        Long documentId = Long.parseLong(request.get("documentId").toString());
        String context = (String) request.get("context");
        String question = (String) request.get("question");

        // Lưu câu hỏi của User
        chatMessageRepository.save(new ChatMessageModel(documentId, "USER", question));

        StringBuilder fullAnswer = new StringBuilder();

        return aiTutorService.chatWithDocumentStream(context, question)
                .doOnNext(fullAnswer::append)
                .doOnComplete(() -> {
                    // Lưu câu trả lời hoàn chỉnh của AI khi kết thúc luồng Stream
                    chatMessageRepository.save(new ChatMessageModel(documentId, "AI", fullAnswer.toString()));
                });
    }
}
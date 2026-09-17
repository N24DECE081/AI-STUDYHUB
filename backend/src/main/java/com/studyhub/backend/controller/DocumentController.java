package com.studyhub.backend.controller;

import com.studyhub.backend.model.Document;
import com.studyhub.backend.service.DocumentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

//API Xem / Tải file PDF
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import java.nio.file.Path;
import java.nio.file.Paths;


import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    // CREATE - Đã nâng cấp Validation & Exception Handling
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> createDocument(
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "description", required = false) String description) {

        // 1. KIỂM TRA DỮ LIỆU RỖNG (Empty Validation)
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body("Lỗi: Vui lòng đính kèm file tài liệu!");
        }
        if (title == null || title.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Lỗi: Tiêu đề tài liệu không được để trống!");
        }

        // 2. KIỂM TRA ĐỊNH DẠNG FILE (Extension Validation)
        String fileName = file.getOriginalFilename();
        if (fileName != null && !fileName.toLowerCase().endsWith(".pdf")
                && !fileName.toLowerCase().endsWith(".docx")) {
            return ResponseEntity.badRequest().body("Lỗi: Hệ thống chỉ hỗ trợ định dạng .pdf hoặc .docx!");
        }

        // 3. KIỂM TRA DUNG LƯỢNG (Size Validation) - Giới hạn 5MB
        // 10MB = 10 * 1024 * 1024 bytes = 10485760 bytes
        if (file.getSize() > 10485760) {
            return ResponseEntity.badRequest().body("Lỗi: Dung lượng file không được vượt quá 10MB!");
        }

        // 4. XỬ LÝ NGOẠI LỆ (Exception Handling)
        try {
            // Nếu qua hết các vòng kiểm tra trên, mới gọi Service để lưu file
            Document createdDocument = documentService.uploadAndCreateDocument(file, title, description);
            return ResponseEntity.ok(createdDocument);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Lỗi Server khi upload file: " + e.getMessage());
        }
    }
    
    // 1. LẤY DANH SÁCH & TÌM KIẾM THEO TÊN
    @GetMapping
    public ResponseEntity<List<Document>> getAllDocuments(
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(documentService.getAllDocuments(search));
    }

    // 2. LẤY THEO ID (GET BY ID)
    @GetMapping("/{id}")
    public ResponseEntity<?> getDocumentById(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(documentService.getDocumentById(id));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Lỗi: " + e.getMessage());
        }
    }

    // 3. CẬP NHẬT (UPDATE)
    @PutMapping("/{id}")
    public ResponseEntity<?> updateDocument(
            @PathVariable UUID id,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String description) {
        try {
            return ResponseEntity.ok(documentService.updateDocument(id, title, description));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Lỗi cập nhật: " + e.getMessage());
        }
    }

    // 4. XÓA TÀI LIỆU (DELETE)
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteDocument(@PathVariable UUID id) {
        try {
            documentService.deleteDocument(id);
            return ResponseEntity.noContent().build(); // Trả về mã 204 (Xóa thành công)
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Lỗi khi xóa: " + e.getMessage());
        }
    }
    
    // CÁC API CÒN LẠI GIỮ NGUYÊN NHƯ CŨ
    // ...
    // LẤY/XEM FILE PDF
    @GetMapping("/download/{fileName:.+}")
    public ResponseEntity<Resource> downloadDocument(@PathVariable String fileName) {
        try {
            // Trỏ tới thư mục uploads của bạn
            Path filePath = Paths.get("uploads/").resolve(fileName).normalize();
            Resource resource = new UrlResource(filePath.toUri());

            if (resource.exists() && resource.isReadable()) {
                return ResponseEntity.ok()
                        // Định dạng trả về là PDF
                        .contentType(MediaType.APPLICATION_PDF)
                        // Lệnh "inline" giúp hiển thị thẳng trên trình duyệt thay vì ép tải về
                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                        .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}

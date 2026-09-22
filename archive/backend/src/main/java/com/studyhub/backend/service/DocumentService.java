package com.studyhub.backend.service;

import com.studyhub.backend.model.Document;
import com.studyhub.backend.repository.DocumentRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;

import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.core.io.FileSystemResource;

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;
    private final String UPLOAD_DIR = "uploads/";

    // Constructor: Inject Repository và tạo thư mục uploads
    public DocumentService(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
        try {
            Path uploadPath = Paths.get(UPLOAD_DIR);
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }
        } catch (IOException e) {
            throw new RuntimeException("Không thể tạo thư mục lưu file: " + e.getMessage());
        }
    }

    // CREATE (Upload file và lưu vào Database)
    public Document uploadAndCreateDocument(MultipartFile file, String title, String description) throws IOException {
        // 1. Lưu file xuống ổ cứng
        String originalFileName = file.getOriginalFilename();
        Path filePath = Paths.get(UPLOAD_DIR + System.currentTimeMillis() + "_" + originalFileName);
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

        // 2. Tạo đối tượng Document bằng Builder
        Document document = Document.builder()
                .userId(UUID.fromString("123e4567-e89b-12d3-a456-426614174000"))
                .title(title)
                .description(description)
                .fileName(originalFileName)
                .fileUrl(filePath.toString())
                .fileType(file.getContentType()) // BỔ SUNG: Tự động lưu loại file (VD: application/pdf)
                .fileSizeBytes(file.getSize()) // BỔ SUNG: Tự động lưu dung lượng file bằng Byte
                .processingStatus("pending")
                .build();

        // 3. LƯU THẲNG VÀO POSTGRESQL
        Document savedDocument = documentRepository.save(document);
        // 4. BẮN FILE SANG KHỐI AI (Chạy ngầm bằng Thread để không làm đơ Web)
        new Thread(() -> sendFileToAI(filePath, savedDocument.getId())).start();

        return savedDocument;
    }
    
    // HÀM MỚI: Logic trung gian gọi sang API của FastAPI (Python)
    private void sendFileToAI(Path filePath, UUID documentId) {
        try {
            RestTemplate restTemplate = new RestTemplate();

            // Giả định khối AI (Thành viên 6) chạy FastAPI ở cổng 8000
            String aiServerUrl = "http://localhost:8000/api/ai/extract";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            // Đóng gói file vật lý và ID của tài liệu để gửi đi
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new FileSystemResource(filePath.toFile()));
            body.add("document_id", documentId.toString());

            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            // Bắn Request (POST)
            System.out.println("Đang bắn file sang khối AI...");
            String response = restTemplate.postForObject(aiServerUrl, requestEntity, String.class);
            System.out.println("AI phản hồi: " + response);

            // (Tùy chọn) Sau này có thể dùng documentRepository để update processingStatus
            // thành "completed"

        } catch (Exception e) {
            System.err.println("Lỗi hoặc khối AI chưa bật Server: " + e.getMessage());
        }
    }

    // READ (Lấy toàn bộ từ DB)
    // LẤY DANH SÁCH & TÌM KIẾM
    public List<Document> getAllDocuments(String searchKeyword) {
        // Nếu người dùng có gõ từ khóa, gọi hàm tìm kiếm
        if (searchKeyword != null && !searchKeyword.trim().isEmpty()) {
            return documentRepository.findByTitleContainingIgnoreCase(searchKeyword);
        }
        // Nếu không có từ khóa (để trống), lấy toàn bộ tài liệu như cũ
        return documentRepository.findAll();
    }
    
    // READ BY ID: Lấy chi tiết 1 tài liệu theo UUID
    public Document getDocumentById(UUID id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Tài liệu không tồn tại với ID: " + id));
    }

    // UPDATE: Cập nhật Tiêu đề và Mô tả
    public Document updateDocument(UUID id, String title, String description) {
        Document document = getDocumentById(id);

        if (title != null && !title.trim().isEmpty()) {
            document.setTitle(title);
        }
        if (description != null && !description.trim().isEmpty()) {
            document.setDescription(description);
        }

        return documentRepository.save(document);
    }

    // DELETE: Xóa tài liệu khỏi Database và dọn dẹp ổ cứng
    public void deleteDocument(UUID id) {
        Document document = getDocumentById(id);

        // 1. Xóa file vật lý trong thư mục uploads/
        try {
            Path filePath = Paths.get(document.getFileUrl());
            Files.deleteIfExists(filePath);
        } catch (IOException e) {
            System.err.println("Không thể xóa file vật lý: " + e.getMessage());
        }

        // 2. Xóa thông tin trong Database PostgreSQL
        documentRepository.delete(document);
    }
}
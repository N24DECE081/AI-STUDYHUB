package com.studyhub.backend.repository;

import com.studyhub.backend.model.Document;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DocumentRepository extends JpaRepository<Document, UUID> {
    // Chỉ cần khai báo thế này, Spring Boot sẽ tự động tạo sẵn cho bạn
    // tất cả các hàm lưu, xóa, sửa, tìm kiếm vào PostgreSQL!
    // Tìm kiếm tài liệu theo tiêu đề (không phân biệt chữ hoa, chữ thường)
    List<Document> findByTitleContainingIgnoreCase(String title);
}
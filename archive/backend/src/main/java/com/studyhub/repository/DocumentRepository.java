package com.studyhub.repository;

import com.studyhub.model.DocumentModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface DocumentRepository extends JpaRepository<DocumentModel, Long> {
    
    // Tìm tất cả tài liệu và sắp xếp theo ID giảm dần (mới nhất lên đầu)
    List<DocumentModel> findAllByOrderByIdDesc();
}
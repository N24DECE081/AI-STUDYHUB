package com.studyhub.repository;

import com.studyhub.model.ChatMessageModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessageModel, Long> {
    List<ChatMessageModel> findByDocumentIdOrderByCreatedAtAsc(Long documentId);
}
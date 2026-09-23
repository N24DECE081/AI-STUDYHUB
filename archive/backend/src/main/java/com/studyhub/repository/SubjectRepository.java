package com.studyhub.repository;

import com.studyhub.model.Subject;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface SubjectRepository extends JpaRepository<Subject, Long> {
    List<Subject> findByActiveTrue();
    List<Subject> findByCodeIgnoreCase(String code);
    List<Subject> findByNameContainingIgnoreCase(String name);
}

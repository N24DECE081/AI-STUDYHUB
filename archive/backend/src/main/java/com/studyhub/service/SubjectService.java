package com.studyhub.service;

import com.studyhub.model.Subject;
import com.studyhub.repository.SubjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SubjectService {

    private final SubjectRepository subjectRepository;

    public SubjectService(SubjectRepository subjectRepository) {
        this.subjectRepository = subjectRepository;
    }

    public List<Subject> listActive() {
        return subjectRepository.findByActiveTrue();
    }

    public List<Subject> listAll() {
        return subjectRepository.findAll();
    }

    public Subject getById(Long id) {
        return subjectRepository.findById(id).orElse(null);
    }

    public Subject getByCode(String code) {
        return subjectRepository.findByCodeIgnoreCase(code).stream().findFirst().orElse(null);
    }

    @Transactional
    public Subject create(Subject subject) {
        if (subjectRepository.findByCodeIgnoreCase(subject.getCode()).stream().findFirst().isPresent()) {
            throw new IllegalArgumentException("Mã môn học \"" + subject.getCode() + "\" đã tồn tại.");
        }
        if (subjectRepository.findByNameContainingIgnoreCase(subject.getName()).stream().findFirst().isPresent()) {
            throw new IllegalArgumentException("Tên môn học \"" + subject.getName() + "\" đã tồn tại.");
        }
        return subjectRepository.save(subject);
    }

    @Transactional
    public Subject update(Long id, Subject subject) {
        Subject existing = getById(id);
        if (existing == null) {
            throw new IllegalArgumentException("Không tìm thấy môn học.");
        }
        if (!existing.getCode().equalsIgnoreCase(subject.getCode()) &&
            subjectRepository.findByCodeIgnoreCase(subject.getCode()).stream().findFirst().isPresent()) {
            throw new IllegalArgumentException("Mã môn học \"" + subject.getCode() + "\" đã tồn tại.");
        }
        existing.setName(subject.getName());
        existing.setDescription(subject.getDescription());
        existing.setActive(subject.getActive());
        return subjectRepository.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        Subject subject = getById(id);
        if (subject == null) {
            throw new IllegalArgumentException("Không tìm thấy môn học.");
        }
        subjectRepository.delete(subject);
    }

    public Map<String, Object> toDto(Subject subject) {
        return Map.of(
            "id", subject.getId(),
            "code", subject.getCode(),
            "name", subject.getName(),
            "description", subject.getDescription(),
            "active", subject.getActive(),
            "createdAt", subject.getCreatedAt()
        );
    }
}

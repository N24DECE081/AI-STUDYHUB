package com.studyhub.controller;

import com.studyhub.model.Subject;
import com.studyhub.service.SubjectService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/subjects")
public class SubjectsController {

    private final SubjectService subjectService;

    public SubjectsController(SubjectService subjectService) {
        this.subjectService = subjectService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAll() {
        return ResponseEntity.ok(
            subjectService.listActive().stream()
                .map(subjectService::toDto)
                .toList()
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id) {
        Subject subject = subjectService.getById(id);
        if (subject == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(subjectService.toDto(subject));
    }

    @GetMapping("/search")
    public ResponseEntity<List<Map<String, Object>>> search(@RequestParam String q) {
        return ResponseEntity.ok(
            subjectService.listAll().stream()
                .filter(s -> s.getCode().toLowerCase().contains(q.toLowerCase()) ||
                             s.getName().toLowerCase().contains(q.toLowerCase()))
                .map(subjectService::toDto)
                .toList()
        );
    }

    // --- Admin --- //
    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, String> body) {
        try {
            Subject subject = new Subject(
                body.get("code"),
                body.get("name")
            );
            if (body.containsKey("description")) {
                subject.setDescription(body.get("description"));
            }
            subject.setActive(body.containsKey("active") && Boolean.parseBoolean(body.get("active")));
            Subject created = subjectService.create(subject);
            return ResponseEntity.status(HttpStatus.CREATED).body(subjectService.toDto(created));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, String> body) {
        try {
            Subject subject = new Subject();
            subject.setCode(body.get("code"));
            subject.setName(body.get("name"));
            if (body.containsKey("description")) subject.setDescription(body.get("description"));
            if (body.containsKey("active")) subject.setActive(Boolean.parseBoolean(body.get("active")));
            Subject updated = subjectService.update(id, subject);
            return ResponseEntity.ok(subjectService.toDto(updated));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        try {
            subjectService.delete(id);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}

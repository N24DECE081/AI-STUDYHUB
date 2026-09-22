package com.studyhub.service;

import com.studyhub.model.DocumentModel;
import com.studyhub.repository.DocumentRepository;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;

    public DocumentService(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
    }

    public DocumentModel processAndSaveDocument(MultipartFile file) throws Exception {
        String fileName = file.getOriginalFilename();
        String extractedText = "";

        if (fileName != null) {
            if (fileName.toLowerCase().endsWith(".pdf")) {
                try (PDDocument document = PDDocument.load(file.getInputStream())) {
                    PDFTextStripper stripper = new PDFTextStripper();
                    extractedText = stripper.getText(document);
                }
            } else if (fileName.toLowerCase().endsWith(".docx")) {
                try (InputStream is = file.getInputStream();
                     XWPFDocument doc = new XWPFDocument(is)) {
                    StringBuilder sb = new StringBuilder();
                    List<XWPFParagraph> paragraphs = doc.getParagraphs();
                    for (XWPFParagraph p : paragraphs) {
                        sb.append(p.getText()).append("\n");
                    }
                    extractedText = sb.toString();
                }
            } else {
                extractedText = new String(file.getBytes(), StandardCharsets.UTF_8);
            }
        }

        DocumentModel doc = new DocumentModel();
        doc.setFileName(fileName);
        doc.setExtractedText(extractedText);
        return documentRepository.save(doc);
    }
}
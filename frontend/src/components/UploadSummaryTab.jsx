import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

function UploadSummaryTab({ onUploadSuccess, currentDocument, setCurrentDocument }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert('Vui lòng chọn file trước!');

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8081/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentDocument(data);
        onUploadSuccess();
        alert('Tải lên và tóm tắt thành công!');
      } else {
        const errorText = await res.text();
        alert('Lỗi: ' + errorText);
      }
    } catch {
      alert('Không thể kết nối Backend!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* KHUNG FORM UPLOAD */}
      <div style={{
        background: '#fbf9ff',
        border: '2px dashed #c4b5fd',
        borderRadius: '16px',
        padding: '32px',
        textAlign: 'center'
      }}>
        <h3 style={{ fontSize: '18px', color: '#4c1d95', marginBottom: '8px' }}>Tải lên tài liệu học tập (PDF, DOCX, TXT)</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>Hệ thống sẽ tự động rút trích nội dung và tạo bản tóm tắt bằng Gemini AI</p>

        <form onSubmit={handleUpload} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.docx,.txt"
            style={{
              padding: '10px 16px',
              background: '#ffffff',
              border: '1px solid #ddd6fe',
              borderRadius: '10px',
              fontSize: '14px',
              color: '#4b5563',
              cursor: 'pointer'
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)'
            }}
          >
            {loading ? 'Đang xử lý...' : 'Tải lên & Tóm tắt'}
          </button>
        </form>
      </div>

      {/* KHUNG HIỂN THỊ NỘI DUNG TÓM TẮT */}
      {currentDocument ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '16px', color: '#5b21b6', borderBottom: '2px solid #f3e8ff', paddingBottom: '8px' }}>
            Bản tóm tắt: {currentDocument.fileName}
          </h3>
          <div style={{
            background: '#faf8ff',
            padding: '20px 24px',
            borderRadius: '12px',
            border: '1px solid #ede9fe',
            lineHeight: '1.7',
            fontSize: '14px',
            color: '#374151'
          }}>
            <ReactMarkdown>{currentDocument.summary}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          Chưa có tài liệu nào được chọn để hiển thị tóm tắt.
        </div>
      )}

    </div>
  );
}

export default UploadSummaryTab;

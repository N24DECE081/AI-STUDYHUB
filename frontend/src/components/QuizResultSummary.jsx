export default function QuizResultSummary({ quiz, result, onReviewQuestion }) {
  const percentage = Math.round((result.score / Math.max(result.total, 1)) * 100);
  const skippedCount = result.items.filter((item) => item.selected_index === null).length;

  const reviewQuestion = (questionId) => {
    const index = quiz.questions.findIndex((question) => question.id === questionId);
    if (index >= 0) {
      onReviewQuestion(index);
      document.querySelector(".quiz-flashcard-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="quiz-result-summary" aria-label="Kết quả bài Quiz">
      <div className="quiz-result-overview">
        <div className="quiz-result-ring" style={{ "--result-percent": `${percentage * 3.6}deg` }}>
          <span><strong>{percentage}%</strong><small>Hoàn thành</small></span>
        </div>
        <div className="quiz-result-copy">
          <span className="eyebrow">KẾT QUẢ BÀI QUIZ</span>
          <h3>{result.weak_count ? "Bạn đang tiến bộ — tiếp tục ôn nhé!" : "Xuất sắc — bạn đã nắm vững nội dung!"}</h3>
          <p>Kết quả được chấm từ tài liệu nguồn. Chọn một mục cần khắc phục để xem lại câu hỏi và lời giải.</p>
        </div>
      </div>

      <div className="quiz-result-stats">
        <article><span>Điểm số</span><strong>{result.score_10}<small>/10</small></strong></article>
        <article className="is-success"><span>Câu đúng</span><strong>{result.score}<small>/{result.total}</small></strong></article>
        <article className="is-warning"><span>Cần xem lại</span><strong>{result.weak_count}</strong></article>
        <article><span>Chưa trả lời</span><strong>{skippedCount}</strong></article>
      </div>

      <div className="quiz-review-panel">
        <div className="quiz-review-heading">
          <div><span className="eyebrow">ĐIỂM CẦN KHẮC PHỤC</span><h3>{result.weak_count ? `${result.weak_count} câu cần xem lại` : "Không có câu trả lời sai"}</h3></div>
          {result.weak_items?.length > 0 && <button type="button" className="text-link" onClick={() => reviewQuestion(result.weak_items[0].id)}>Xem câu đầu tiên →</button>}
        </div>
        {result.weak_items?.length > 0 ? (
          <div className="quiz-review-list">
            {result.weak_items.map((item) => {
              const questionIndex = quiz.questions.findIndex((question) => question.id === item.id);
              return (
                <button type="button" onClick={() => reviewQuestion(item.id)} key={item.id}>
                  <b>{questionIndex + 1}</b>
                  <span><strong>{item.question}</strong><small>{item.selected_index === null ? "Chưa trả lời" : "Trả lời chưa đúng"} · {item.source_title || "Tài liệu nguồn"}{item.source_locator ? ` · ${item.source_locator}` : ""}</small></span>
                  <i>→</i>
                </button>
              );
            })}
          </div>
        ) : <p className="quiz-review-empty">Bạn đã trả lời đúng toàn bộ câu hỏi. Hãy tiếp tục duy trì kết quả này!</p>}
      </div>
    </section>
  );
}

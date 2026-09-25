import { useState } from "react";

const PLAN_AMOUNTS = { plus: 199000, pro: 299000 };

export default function PaymentCheckout({ planId, plan, qrImage, onClose }) {
  const [method, setMethod] = useState("qr");
  const [submitted, setSubmitted] = useState(false);
  const amount = PLAN_AMOUNTS[planId] || 0;
  const reference = `STUDYHUB-${planId.toUpperCase()}`;

  if (submitted) return (
    <div className="payment-checkout">
      <div className="payment-pending"><span>✓</span><h3>Đã ghi nhận yêu cầu kiểm tra</h3><p>Gói học chưa được kích hoạt. Quản trị viên hoặc webhook thanh toán cần xác nhận đúng số tiền và nội dung giao dịch.</p><button type="button" className="btn btn-primary full" onClick={onClose}>Hoàn tất</button></div>
    </div>
  );

  return (
    <div className="payment-checkout">
      <div className="payment-order"><span>Gói đã chọn</span><strong>{plan.name}</strong><b>{amount.toLocaleString("vi-VN")}đ <small>/ tháng</small></b></div>
      <div className="payment-method-tabs">
        <button type="button" className={method === "qr" ? "active" : ""} onClick={() => setMethod("qr")}>VietQR / MoMo</button>
        <button type="button" className={method === "bank" ? "active" : ""} onClick={() => setMethod("bank")}>Chuyển khoản</button>
      </div>
      {method === "qr" ? <div className="payment-qr-panel">
        <img src={qrImage} alt="Mã QR thanh toán MoMo VietQR" />
        <div><strong>Quét bằng ứng dụng ngân hàng hoặc MoMo</strong><span>Số tiền gói: {amount.toLocaleString("vi-VN")}đ</span><span>Nội dung: {reference}</span></div>
        <p><b>Lưu ý:</b> QR được cung cấp đang chứa số tiền 24.500đ, chưa trùng giá gói. Chỉ dùng để kiểm thử giao diện; cần QR động đúng số tiền trước khi thu tiền thật.</p>
      </div> : <div className="payment-bank-panel"><span>Người nhận</span><strong>PHAN NGUYEN TIEN VY</strong><span>Số tài khoản</span><strong>•••••••775</strong><span>Số tiền</span><strong>{amount.toLocaleString("vi-VN")}đ</strong><span>Nội dung chuyển khoản</span><strong>{reference}</strong><p>Cần cấu hình đầy đủ ngân hàng và số tài khoản trước khi triển khai thật.</p></div>}
      <label className="payment-confirm-check"><input type="checkbox" required /> Tôi hiểu gói chỉ được kích hoạt sau khi giao dịch được hệ thống xác nhận.</label>
      <button type="button" className="btn btn-primary full" onClick={(event) => { const checkbox = event.currentTarget.parentElement.querySelector("input[type=checkbox]"); if (checkbox.reportValidity()) setSubmitted(true); }}>Tôi đã thanh toán — gửi kiểm tra</button>
    </div>
  );
}

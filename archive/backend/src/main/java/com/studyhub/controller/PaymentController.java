package com.studyhub.controller;

import com.studyhub.service.VnPayService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private final VnPayService vnPayService;

    public PaymentController(VnPayService vnPayService) {
        this.vnPayService = vnPayService;
    }

    // Tạo URL thanh toán VNPay
    // POST /api/payment/vnpay/create
    // Body: { "orderId": "...", "orderInfo": "...", "amount": 100000, "userId": "..." }
    @PostMapping("/vnpay/create")
    public ResponseEntity<?> createVnpayUrl(@RequestBody Map<String, Object> body) {
        try {
            String orderId = (String) body.get("orderId");
            String orderInfo = (String) body.getOrDefault("orderInfo", "Thanh toan gói học tập");
            long amount = Long.parseLong(body.get("amount").toString());
            String userId = (String) body.get("userId");

            if (orderId == null || orderId.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Thiếu orderId"));
            }
            if (amount <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Số tiền không hợp lệ"));
            }

            String vnpayUrl = vnPayService.createPaymentUrl(
                    Long.parseLong(orderId),
                    orderInfo,
                    amount,
                    userId
            );

            return ResponseEntity.ok(Map.of(
                    "vnpayUrl", vnpayUrl,
                    "orderId", orderId,
                    "amount", amount
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Không tạo được liên kết thanh toán: " + e.getMessage()));
        }
    }

    // Xử lý IPN từ VNPay (Gọi từ VNPay server)
    // POST /api/payment/vnpay/ipn
    @PostMapping("/vnpay/ipn")
    public ResponseEntity<?> handleIpn(@RequestBody Map<String, String> ipnData) {
        boolean isValid = vnPayService.verifyIpn(ipnData);

        if (!isValid) {
            return ResponseEntity.ok(Map.of("RspCode", "02", "Message", "Có lỗi xảy ra trong quá trình kiểm tra chữ ký"));
        }

        String vnpOrderId = ipnData.get("vnp_OrderId");
        String vnpStatusCode = ipnData.get("vnp_TransactionStatus");
        String vnpResponseCode = ipnData.get("vnp_ResponseCode");

        // Xử lý nghiệp vụ theo trạng thái thanh toán
        Map<String, String> result = Map.of(
                "RspCode", "00",
                "Message", " Thanh toán thành công",
                "OrderId", vnpOrderId,
                "Status", vnpStatusCode,
                "ResponseCode", vnpResponseCode
        );

        if ("00".equals(vnpStatusCode) || "00".equals(vnpResponseCode)) {
            // Thành công → cập nhật đơn hàng trong DB
            // TODO: Gọi service cập nhật subscription/order trong DB
        }

        return ResponseEntity.ok(result);
    }

    // Kiểm tra trạng thái thanh toán (để frontend gọi sau khi trả từ VNPay)
    @GetMapping("/vnpay/status/{orderId}")
    public ResponseEntity<?> checkStatus(@PathVariable String orderId) {
        // TODO: Query DB để kiểm tra trạng thái đơn hàng
        return ResponseEntity.ok(Map.of(
                "orderId", orderId,
                "status", "pending", // pending | completed | failed
                "message", "Chưa xử lý"
        ));
    }
}

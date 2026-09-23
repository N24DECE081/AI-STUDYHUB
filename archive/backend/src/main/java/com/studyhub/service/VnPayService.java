package com.studyhub.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class VnPayService {

    @Value("${vnpay.api.url:https://sandbox.vnpayment.vn}")
    private String vnpayApiUrl;

    @Value("${vnpay.tmn-code:}")
    private String tmnCode;

    @Value("${vnpay.hash-secret:}")
    private String hashSecret;

    @Value("${vnpay.return-url:http://localhost:5173/payment/return}")
    private String returnUrl;

    @Value("${vnpay.ipn-url:http://localhost:5173/payment/ipn}")
    private String ipnUrl;

    @Value("${server.port:8080}")
    private String serverPort;

    private static final String VERSION = "2.1.0";
    private static final String CURRENCY = "VND";

    public String createPaymentUrl(Long orderId, String orderInfo, long amount, String userId) {
        Map<String, String> params = new HashMap<>();
        params.put("vnp_Version", VERSION);
        params.put("vnp_Command", "pay");
        params.put("vnp_TmnCode", tmnCode);
        params.put("vnp_Amount", String.valueOf(amount * 100)); // VNPay dùng số nguyên, đơn vị đồng
        params.put("vnp_Currency", CURRENCY);
        params.put("vnp_OrderInfo", orderInfo);
        params.put("vnp_OrderType", "billpayment");
        params.put("vnp_Locale", "vn");
        params.put("vnp_ReturnUrl", returnUrl);
        params.put("vnp_IpnUrl", ipnUrl);
        params.put("vnp_Bill_Mobile", userId != null ? userId : "");
        params.put("vnp_Bill_Email", "");
        params.put("vnp_Bill_Message", "Thanh toan hoc tap");
        params.put("vnp_SecureHashType", "SHA256");

        // Tính thời gian hết hạn (15 phút)
        long expiry = System.currentTimeMillis() + 15 * 60 * 1000;
        params.put("vnp_CreateDate", new java.text.SimpleDateFormat("yyyyMMddHHmmss").format(expiry));
        params.put("vnp_IpAddr", "127.0.0.1");

        String hashData = buildHashData(params);
        String secureHash = hashService(hashData);

        params.put("vnp_SecureHash", secureHash);

        return vnpayApiUrl + "/paymentv2/vpcpay.html?" + buildQueryString(params);
    }

    public boolean verifyIpn(Map<String, String> ipnData) {
        String secureHash = ipnData.remove("vnp_SecureHash");
        String hashData = buildHashData(ipnData);
        String expectedHash = hashService(hashData);
        return secureHash != null && secureHash.equals(expectedHash);
    }

    private String buildHashData(Map<String, String> params) {
        List<String> sortedKeys = new ArrayList<>(params.keySet());
        Collections.sort(sortedKeys);
        StringBuilder sb = new StringBuilder();
        for (String key : sortedKeys) {
            String value = params.get(key);
            if (value != null && !value.isEmpty() && !"vnp_SecureHash".equals(key)) {
                sb.append(key).append("=").append(value).append("&");
            }
        }
        if (sb.length() > 0) {
            sb.setLength(sb.length() - 1);
        }
        return sb.toString();
    }

    private String hashService(String data) {
        String secret = hashSecret == null ? "" : hashSecret;
        try {
            String payload = data + "&key=" + secret;
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA256");
            byte[] digest = md.digest(payload.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(digest);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi tính checksum VNPay", e);
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private String buildQueryString(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (sb.length() > 0) sb.append("&");
            try {
                sb.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8.toString()))
                  .append("=")
                  .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8.toString()));
            } catch (UnsupportedEncodingException ignored) {}
        }
        return sb.toString();
    }
}

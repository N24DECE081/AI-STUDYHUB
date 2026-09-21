package com.studyhub.controller;

import com.studyhub.model.UserAccount;
import com.studyhub.repository.UserAccountRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final int ITERATIONS = 210_000;
    private static final int KEY_LENGTH = 256;
    private final UserAccountRepository users;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthController(UserAccountRepository users) {
        this.users = users;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        String name = value(body, "name");
        String email = value(body, "email").toLowerCase();
        String password = value(body, "password");
        if (name.isBlank() || email.isBlank() || password.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("error", "Họ tên, email và mật khẩu (ít nhất 6 ký tự) là bắt buộc."));
        }
        if (users.existsByEmail(email)) {
            return ResponseEntity.status(409).body(Map.of("error", "Email này đã được đăng ký."));
        }

        byte[] salt = new byte[16];
        secureRandom.nextBytes(salt);
        UserAccount user = new UserAccount();
        user.setName(name);
        user.setEmail(email);
        user.setPasswordSalt(Base64.getEncoder().encodeToString(salt));
        user.setPasswordHash(hash(password, salt));
        users.save(user);
        return ResponseEntity.status(201).body(Map.of("user", publicUser(user)));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String email = value(body, "email").toLowerCase();
        String password = value(body, "password");
        Optional<UserAccount> user = users.findByEmail(email);
        if (user.isEmpty() || !hash(password, Base64.getDecoder().decode(user.get().getPasswordSalt())).equals(user.get().getPasswordHash())) {
            return ResponseEntity.status(401).body(Map.of("error", "Email hoặc mật khẩu không đúng."));
        }
        return ResponseEntity.ok(Map.of("user", publicUser(user.get())));
    }

    @PostMapping("/logout")
    public Map<String, Boolean> logout() {
        return Map.of("success", true);
    }

    private static String value(Map<String, String> body, String key) {
        return body.getOrDefault(key, "").trim();
    }

    private static Map<String, Object> publicUser(UserAccount user) {
        return Map.of("id", user.getId(), "name", user.getName(), "email", user.getEmail());
    }

    private static String hash(String password, byte[] salt) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH);
            byte[] value = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            spec.clearPassword();
            return Base64.getEncoder().encodeToString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Không thể mã hóa mật khẩu.", exception);
        }
    }
}

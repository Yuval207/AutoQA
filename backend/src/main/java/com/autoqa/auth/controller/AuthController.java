package com.autoqa.auth.controller;

import com.autoqa.auth.dto.AuthResponse;
import com.autoqa.auth.dto.LoginRequest;
import com.autoqa.auth.dto.RegisterRequest;
import com.autoqa.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me")
    public ResponseEntity<com.autoqa.auth.dto.UserResponse> getMe(
            @org.springframework.security.core.annotation.AuthenticationPrincipal com.autoqa.auth.entity.User user) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(new com.autoqa.auth.dto.UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName()
        ));
    }
}

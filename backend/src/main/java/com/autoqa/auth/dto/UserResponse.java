package com.autoqa.auth.dto;

import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String fullName
) {}

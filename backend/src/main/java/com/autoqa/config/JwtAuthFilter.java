package com.autoqa.config;

import com.autoqa.auth.entity.User;
import com.autoqa.auth.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final long USER_CACHE_TTL_MS = 60_000;

    private record CachedUser(User user, long expiresAt) {}

    private final JwtProvider jwtProvider;
    private final UserRepository userRepository;
    private final Map<UUID, CachedUser> userCache = new ConcurrentHashMap<>();

    public JwtAuthFilter(JwtProvider jwtProvider, UserRepository userRepository) {
        this.jwtProvider = jwtProvider;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);

        if (token != null && jwtProvider.validateToken(token)) {
            UUID userId = jwtProvider.getUserIdFromToken(token);
            User user = loadUser(userId);

            if (user != null) {
                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(user, null, Collections.emptyList());
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }

        filterChain.doFilter(request, response);
    }

    // Avoids a remote DB round-trip on every authenticated request
    private User loadUser(UUID userId) {
        long now = System.currentTimeMillis();
        CachedUser cached = userCache.get(userId);
        if (cached != null && cached.expiresAt() > now) {
            return cached.user();
        }
        User user = userRepository.findById(userId).orElse(null);
        if (user != null) {
            userCache.put(userId, new CachedUser(user, now + USER_CACHE_TTL_MS));
        } else {
            userCache.remove(userId);
        }
        return user;
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}

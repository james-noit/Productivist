package com.productivist.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Issues opaque bearer tokens and resolves them back to a user id. Only SHA-256 hashes are stored. */
@Service
public class TokenService {

    private final JdbcClient jdbc;
    private final SecureRandom random = new SecureRandom();

    public TokenService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public String issue(long userId) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.sql("INSERT INTO auth_tokens (token_hash, user_id) VALUES (:hash, :userId)")
                .param("hash", hash(token))
                .param("userId", userId)
                .update();
        return token;
    }

    public Optional<Long> resolve(String token) {
        return jdbc.sql("SELECT user_id FROM auth_tokens WHERE token_hash = :hash")
                .param("hash", hash(token))
                .query(Long.class)
                .optional();
    }

    private static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

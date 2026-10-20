package com.autoqa.artifact.controller;

import com.autoqa.common.exception.BadRequestException;
import com.autoqa.common.exception.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/artifacts")
public class ArtifactController {

    @Value("${autoqa.storage.artifacts-path}")
    private String artifactsPath;

    @GetMapping("/{runId}/{filename:.+}")
    public ResponseEntity<Resource> getArtifact(
            @PathVariable String runId,
            @PathVariable String filename) {

        // Prevent path traversal
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\") ||
            runId.contains("..") || runId.contains("/") || runId.contains("\\")) {
            throw new BadRequestException("Invalid filename or runId");
        }

        List<Path> candidateBases = new ArrayList<>();
        if (artifactsPath != null && !artifactsPath.isBlank()) {
            candidateBases.add(Paths.get(artifactsPath));
        }
        candidateBases.add(Paths.get("/Users/yuvalsharma/Desktop/AutoQA/data/artifacts"));
        candidateBases.add(Paths.get("/Users/yuvalsharma/Desktop/AutoQA/worker/data/artifacts"));
        candidateBases.add(Paths.get("/Users/yuvalsharma/Desktop/AutoQA/backend/data/artifacts"));
        try {
            Path current = Paths.get(System.getProperty("user.dir"));
            candidateBases.add(current.resolve("data/artifacts"));
            if (current.getParent() != null) {
                candidateBases.add(current.getParent().resolve("data/artifacts"));
                candidateBases.add(current.getParent().resolve("worker/data/artifacts"));
            }
        } catch (Exception ignored) {}

        Path foundPath = null;
        for (Path base : candidateBases) {
            Path candidate = base.resolve(runId).resolve(filename).toAbsolutePath().normalize();
            if (Files.exists(candidate)) {
                foundPath = candidate;
                break;
            }
        }

        if (foundPath == null) {
            throw new ResourceNotFoundException("Artifact not found: " + filename);
        }

        Resource resource = new FileSystemResource(foundPath);
        String contentType = "application/octet-stream";
        if (filename.endsWith(".png")) contentType = "image/png";
        else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) contentType = "image/jpeg";
        else if (filename.endsWith(".json")) contentType = "application/json";
        else if (filename.endsWith(".log") || filename.endsWith(".txt")) contentType = "text/plain";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CACHE_CONTROL, "max-age=3600")
                .body(resource);
    }
}

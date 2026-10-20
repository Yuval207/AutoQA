package com.autoqa.project.controller;

import com.autoqa.auth.entity.User;
import com.autoqa.project.dto.*;
import com.autoqa.project.service.ProjectService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> createProject(
            @Valid @RequestBody CreateProjectRequest request,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(projectService.createProject(request, user));
    }

    @GetMapping
    public ResponseEntity<List<ProjectResponse>> listProjects(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(projectService.listProjects(user.getId()));
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<ProjectResponse> getProject(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(projectService.getProject(projectId, user.getId()));
    }

    @PostMapping(value = "/{projectId}/repository", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ProjectResponse> uploadRepository(
            @PathVariable UUID projectId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User user) throws IOException {
        return ResponseEntity.ok(projectService.uploadRepository(projectId, user.getId(), file));
    }

    @PutMapping("/{projectId}/environment")
    public ResponseEntity<ProjectResponse> updateEnvironment(
            @PathVariable UUID projectId,
            @RequestBody UpdateEnvironmentRequest request,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(projectService.updateEnvironment(projectId, user.getId(), request));
    }
}

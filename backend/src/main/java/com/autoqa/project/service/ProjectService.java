package com.autoqa.project.service;

import com.autoqa.auth.entity.User;
import com.autoqa.common.exception.BadRequestException;
import com.autoqa.common.exception.ForbiddenException;
import com.autoqa.common.exception.ResourceNotFoundException;
import com.autoqa.project.dto.*;
import com.autoqa.project.entity.*;
import com.autoqa.project.repository.*;
import com.autoqa.repository.service.RepositoryAnalyzer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class ProjectService {

    private static final Logger log = LoggerFactory.getLogger(ProjectService.class);

    private static final Set<String> EXCLUDED_DIRS = Set.of(
            "node_modules", ".git", "dist", "build", ".next", "__pycache__",
            ".gradle", "target", ".idea", ".vscode", "coverage", ".nyc_output"
    );

    private static final long MAX_ENTRIES = 10000;
    private static final long MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB

    private final ProjectRepository projectRepository;
    private final RepositorySourceRepository repoSourceRepository;
    private final EnvironmentConfigRepository envConfigRepository;
    private final RepositoryAnalyzer repositoryAnalyzer;

    @Value("${autoqa.storage.uploads-path}")
    private String uploadsPath;

    @Value("${autoqa.storage.workspaces-path}")
    private String workspacesPath;

    public ProjectService(ProjectRepository projectRepository,
                          RepositorySourceRepository repoSourceRepository,
                          EnvironmentConfigRepository envConfigRepository,
                          RepositoryAnalyzer repositoryAnalyzer) {
        this.projectRepository = projectRepository;
        this.repoSourceRepository = repoSourceRepository;
        this.envConfigRepository = envConfigRepository;
        this.repositoryAnalyzer = repositoryAnalyzer;
    }

    @Transactional
    public ProjectResponse createProject(CreateProjectRequest request, User user) {
        Project project = new Project();
        project.setUser(user);
        project.setName(request.name());
        project.setDescription(request.description());
        project = projectRepository.save(project);
        return toResponse(project, null, null);
    }

    public List<ProjectResponse> listProjects(UUID userId) {
        return projectRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(p -> {
                    var repo = repoSourceRepository.findFirstByProjectIdOrderByCreatedAtDesc(p.getId()).orElse(null);
                    var env = envConfigRepository.findByProjectId(p.getId()).orElse(null);
                    return toResponse(p, repo, env);
                })
                .collect(Collectors.toList());
    }

    public ProjectResponse getProject(UUID projectId, UUID userId) {
        Project project = projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
        var repo = repoSourceRepository.findFirstByProjectIdOrderByCreatedAtDesc(projectId).orElse(null);
        var env = envConfigRepository.findByProjectId(projectId).orElse(null);
        return toResponse(project, repo, env);
    }

    public Project getProjectEntity(UUID projectId, UUID userId) {
        return projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
    }

    public void verifyOwnership(UUID projectId, UUID userId) {
        if (projectRepository.findByIdAndUserId(projectId, userId).isEmpty()) {
            throw new ForbiddenException("You do not have access to this project");
        }
    }

    @Transactional
    public ProjectResponse uploadRepository(UUID projectId, UUID userId, MultipartFile file) throws IOException {
        Project project = getProjectEntity(projectId, userId);

        // Validate file
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.toLowerCase().endsWith(".zip")) {
            throw new BadRequestException("Only ZIP files are supported");
        }
        if (file.isEmpty()) {
            throw new BadRequestException("File is empty");
        }

        // Save uploaded file
        Path uploadDir = Paths.get(uploadsPath, projectId.toString());
        Files.createDirectories(uploadDir);
        Path uploadPath = uploadDir.resolve(UUID.randomUUID() + ".zip");
        file.transferTo(uploadPath);

        // Extract safely
        Path extractDir = Paths.get(workspacesPath, projectId.toString());
        if (Files.exists(extractDir)) {
            deleteRecursive(extractDir);
        }
        Files.createDirectories(extractDir);

        extractZipSafely(uploadPath, extractDir);

        // Find root directory (skip single top-level dir wrapping)
        Path effectiveRoot = findEffectiveRoot(extractDir);

        // Save repository source
        RepositorySource repoSource = new RepositorySource();
        repoSource.setProject(project);
        repoSource.setSourceType("ZIP");
        repoSource.setOriginalFilename(filename);
        repoSource.setStoragePath(uploadPath.toAbsolutePath().normalize().toString());
        repoSource.setExtractedPath(effectiveRoot.toAbsolutePath().normalize().toString());
        repoSource.setFileSizeBytes(file.getSize());
        repoSource.setStatus("EXTRACTED");

        // Analyze repository
        try {
            String analysis = repositoryAnalyzer.analyze(effectiveRoot);
            repoSource.setAnalysisResult(analysis);
            repoSource.setStatus("ANALYZED");

            // Auto-configure environment from analysis
            autoConfigureEnvironment(project, analysis, effectiveRoot);

            // Detect project type
            String projectType = repositoryAnalyzer.detectProjectType(effectiveRoot);
            project.setProjectType(projectType);
            projectRepository.save(project);

        } catch (Exception e) {
            log.error("Repository analysis failed for project {}", projectId, e);
            repoSource.setStatus("ANALYSIS_FAILED");
            repoSource.setErrorMessage("Analysis failed: " + e.getMessage());
        }

        repoSource = repoSourceRepository.save(repoSource);
        var env = envConfigRepository.findByProjectId(projectId).orElse(null);
        return toResponse(project, repoSource, env);
    }

    @Transactional
    public ProjectResponse updateEnvironment(UUID projectId, UUID userId, UpdateEnvironmentRequest request) {
        Project project = getProjectEntity(projectId, userId);
        EnvironmentConfiguration config = envConfigRepository.findByProjectId(projectId)
                .orElseGet(() -> {
                    EnvironmentConfiguration c = new EnvironmentConfiguration();
                    c.setProject(project);
                    return c;
                });

        if (request.startupCommand() != null) config.setStartupCommand(request.startupCommand());
        if (request.installCommand() != null) config.setInstallCommand(request.installCommand());
        if (request.port() != null) config.setPort(request.port());
        if (request.healthCheckPath() != null) config.setHealthCheckPath(request.healthCheckPath());
        if (request.environmentVariables() != null) config.setEnvironmentVariables(request.environmentVariables());
        if (request.workingDirectory() != null) config.setWorkingDirectory(request.workingDirectory());
        if (request.startupTimeoutSeconds() != null) config.setStartupTimeoutSeconds(request.startupTimeoutSeconds());

        envConfigRepository.save(config);

        var repo = repoSourceRepository.findFirstByProjectIdOrderByCreatedAtDesc(projectId).orElse(null);
        return toResponse(project, repo, config);
    }

    private void extractZipSafely(Path zipPath, Path destDir) throws IOException {
        long totalSize = 0;
        long entryCount = 0;
        Path destDirAbsolute = destDir.toAbsolutePath().normalize();

        try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(zipPath))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > MAX_ENTRIES) {
                    throw new BadRequestException("Archive contains too many entries (max " + MAX_ENTRIES + ")");
                }

                String entryName = entry.getName();

                // Path traversal protection
                Path resolved = destDirAbsolute.resolve(entryName).normalize();
                if (!resolved.startsWith(destDirAbsolute)) {
                    throw new BadRequestException("Archive contains path traversal: " + entryName);
                }

                // Skip excluded directories
                if (shouldExclude(entryName)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    Files.createDirectories(resolved);
                } else {
                    Files.createDirectories(resolved.getParent());

                    // Size limit check
                    totalSize += entry.getSize() >= 0 ? entry.getSize() : 0;
                    if (totalSize > MAX_TOTAL_SIZE) {
                        throw new BadRequestException("Extracted archive exceeds maximum size limit");
                    }

                    // Write with size tracking
                    long written = 0;
                    byte[] buffer = new byte[8192];
                    try (var out = Files.newOutputStream(resolved)) {
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            written += len;
                            if (written > MAX_TOTAL_SIZE) {
                                throw new BadRequestException("Extracted archive exceeds maximum size limit");
                            }
                            out.write(buffer, 0, len);
                        }
                    }
                    totalSize += written;
                }

                zis.closeEntry();
            }
        }
    }

    private boolean shouldExclude(String entryName) {
        String[] parts = entryName.split("/");
        for (String part : parts) {
            if (EXCLUDED_DIRS.contains(part)) {
                return true;
            }
        }
        return false;
    }

    private Path findEffectiveRoot(Path extractDir) throws IOException {
        try (var stream = Files.list(extractDir)) {
            List<Path> children = stream.toList();
            if (children.size() == 1 && Files.isDirectory(children.get(0))) {
                return children.get(0);
            }
        }
        return extractDir;
    }

    private void autoConfigureEnvironment(Project project, String analysis, Path rootPath) {
        EnvironmentConfiguration config = envConfigRepository.findByProjectId(project.getId())
                .orElseGet(() -> {
                    EnvironmentConfiguration c = new EnvironmentConfiguration();
                    c.setProject(project);
                    return c;
                });

        // Parse analysis to set defaults
        if (analysis.contains("\"packageManager\":\"npm\"")) {
            config.setInstallCommand("npm install");
        } else if (analysis.contains("\"packageManager\":\"yarn\"")) {
            config.setInstallCommand("yarn install");
        } else if (analysis.contains("\"packageManager\":\"pnpm\"")) {
            config.setInstallCommand("pnpm install");
        }

        if (analysis.contains("\"framework\":\"vite\"") || analysis.contains("\"framework\":\"react-vite\"")) {
            config.setStartupCommand("npm run dev -- --host 0.0.0.0");
            config.setPort(5173);
        } else if (analysis.contains("\"framework\":\"create-react-app\"")) {
            config.setStartupCommand("npm start");
            config.setPort(3000);
        } else if (analysis.contains("\"startScript\"")) {
            config.setStartupCommand("npm start");
            config.setPort(3000);
        }

        config.setWorkingDirectory(null);
        envConfigRepository.save(config);
    }

    private void deleteRecursive(Path path) throws IOException {
        if (Files.isDirectory(path)) {
            try (var stream = Files.walk(path)) {
                stream.sorted(Comparator.reverseOrder())
                        .forEach(p -> {
                            try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                        });
            }
        }
    }

    private ProjectResponse toResponse(Project p, RepositorySource repo, EnvironmentConfiguration env) {
        ProjectResponse.RepositoryInfo repoInfo = repo != null ?
                new ProjectResponse.RepositoryInfo(
                        repo.getId(), repo.getSourceType(), repo.getOriginalFilename(),
                        repo.getStatus(), repo.getAnalysisResult()
                ) : null;

        ProjectResponse.EnvironmentInfo envInfo = env != null ?
                new ProjectResponse.EnvironmentInfo(
                        env.getId(), env.getStartupCommand(), env.getInstallCommand(),
                        env.getPort(), env.getHealthCheckPath(), env.getStartupTimeoutSeconds()
                ) : null;

        return new ProjectResponse(
                p.getId(), p.getName(), p.getDescription(), p.getProjectType(),
                p.getStatus(), repoInfo, envInfo, p.getCreatedAt(), p.getUpdatedAt()
        );
    }
}

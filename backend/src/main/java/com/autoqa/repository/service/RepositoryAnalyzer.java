package com.autoqa.repository.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Analyzes repository structure to detect framework, package manager,
 * startup commands, routes, and configuration.
 */
@Service
public class RepositoryAnalyzer {

    private static final Logger log = LoggerFactory.getLogger(RepositoryAnalyzer.class);
    private final ObjectMapper mapper = new ObjectMapper();

    public String analyze(Path rootPath) throws IOException {
        ObjectNode result = mapper.createObjectNode();

        // 1. Deep Architecture & Multi-Service Detection (Frontend, Backend, Monorepo)
        ArchitectureAnalysis arch = detectArchitecture(rootPath);
        result.set("architectureAnalysis", mapper.valueToTree(arch));
        result.put("architecture", arch.architecture);
        result.put("confidence", arch.confidence);
        result.put("requiresConfirmation", arch.requiresConfirmation);
        result.set("detectedServices", mapper.valueToTree(arch.services));
        result.set("availableProfiles", mapper.valueToTree(arch.availableProfiles));
        if (arch.recommendedProfile != null) {
            result.set("recommendedProfile", mapper.valueToTree(arch.recommendedProfile));
        }

        // Detect package manager
        String packageManager = detectPackageManager(rootPath);
        if (packageManager.equals("unknown") && !arch.services.isEmpty()) {
            packageManager = arch.services.get(0).packageManager;
        }
        result.put("packageManager", packageManager);

        // Detect framework
        String framework = detectFramework(rootPath);
        if (framework.equals("unknown") && !arch.services.isEmpty()) {
            framework = arch.services.get(0).framework;
        }
        result.put("framework", framework);

        // Read package.json scripts
        ObjectNode scripts = readPackageScripts(rootPath);
        if (scripts != null) {
            result.set("scripts", scripts);
            if (scripts.has("start")) {
                result.put("startScript", scripts.get("start").asText());
            }
            if (scripts.has("dev")) {
                result.put("devScript", scripts.get("dev").asText());
            }
        }

        // Detect entry points
        ArrayNode entryPoints = detectEntryPoints(rootPath);
        result.set("entryPoints", entryPoints);

        // Detect routes (for React apps)
        ArrayNode routes = detectRoutes(rootPath);
        result.set("detectedRoutes", routes);

        // File structure summary
        ArrayNode structure = buildStructureSummary(rootPath);
        result.set("structure", structure);

        // Detect dependencies
        ObjectNode deps = readDependencies(rootPath);
        if (deps != null) {
            result.set("dependencies", deps);
        }

        // Required environment variables
        ArrayNode envVars = detectEnvironmentVariables(rootPath);
        result.set("requiredEnvVars", envVars);

        // Warnings & detection notes
        ArrayNode warnings = mapper.createArrayNode();
        for (String note : arch.detectionNotes) {
            warnings.add(note);
        }
        if (framework.equals("unknown") && arch.services.isEmpty()) {
            warnings.add("Could not detect framework. Manual configuration may be required.");
        }
        if (packageManager.equals("unknown") && arch.services.isEmpty()) {
            warnings.add("Could not detect package manager.");
        }
        result.set("warnings", warnings);

        return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(result);
    }

    public String detectProjectType(Path rootPath) {
        if (Files.exists(rootPath.resolve("package.json"))) {
            String framework = detectFramework(rootPath);
            return switch (framework) {
                case "vite", "react-vite" -> "REACT_VITE";
                case "create-react-app" -> "REACT_CRA";
                case "next" -> "NEXTJS";
                default -> "NODEJS";
            };
        }
        if (Files.exists(rootPath.resolve("pom.xml"))) return "JAVA_MAVEN";
        if (Files.exists(rootPath.resolve("build.gradle"))) return "JAVA_GRADLE";
        return "UNKNOWN";
    }

    private String detectPackageManager(Path root) {
        if (Files.exists(root.resolve("pnpm-lock.yaml"))) return "pnpm";
        if (Files.exists(root.resolve("yarn.lock"))) return "yarn";
        if (Files.exists(root.resolve("package-lock.json"))) return "npm";
        if (Files.exists(root.resolve("package.json"))) return "npm";
        return "unknown";
    }

    private String detectFramework(Path root) {
        try {
            if (Files.exists(root.resolve("vite.config.ts")) || Files.exists(root.resolve("vite.config.js"))) {
                return "react-vite";
            }
            if (Files.exists(root.resolve("next.config.js")) || Files.exists(root.resolve("next.config.mjs"))) {
                return "next";
            }

            Path packageJson = root.resolve("package.json");
            if (Files.exists(packageJson)) {
                String content = Files.readString(packageJson);
                if (content.contains("\"react-scripts\"")) return "create-react-app";
                if (content.contains("\"vite\"")) return "vite";
                if (content.contains("\"next\"")) return "next";
            }
        } catch (IOException e) {
            log.warn("Error detecting framework", e);
        }
        return "unknown";
    }

    private ObjectNode readPackageScripts(Path root) {
        try {
            Path packageJson = root.resolve("package.json");
            if (Files.exists(packageJson)) {
                var tree = mapper.readTree(Files.readString(packageJson));
                if (tree.has("scripts")) {
                    return (ObjectNode) tree.get("scripts");
                }
            }
        } catch (IOException e) {
            log.warn("Error reading package.json scripts", e);
        }
        return null;
    }

    private ObjectNode readDependencies(Path root) {
        try {
            Path packageJson = root.resolve("package.json");
            if (Files.exists(packageJson)) {
                var tree = mapper.readTree(Files.readString(packageJson));
                ObjectNode deps = mapper.createObjectNode();
                if (tree.has("dependencies")) {
                    deps.set("dependencies", tree.get("dependencies"));
                }
                if (tree.has("devDependencies")) {
                    deps.set("devDependencies", tree.get("devDependencies"));
                }
                return deps;
            }
        } catch (IOException e) {
            log.warn("Error reading dependencies", e);
        }
        return null;
    }

    private ArrayNode detectEntryPoints(Path root) {
        ArrayNode entries = mapper.createArrayNode();
        String[] candidates = {
                "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js",
                "src/index.tsx", "src/index.jsx", "src/index.ts", "src/index.js",
                "src/App.tsx", "src/App.jsx", "src/App.ts", "src/App.js",
                "index.html", "public/index.html"
        };
        for (String candidate : candidates) {
            if (Files.exists(root.resolve(candidate))) {
                entries.add(candidate);
            }
        }
        return entries;
    }

    private ArrayNode detectRoutes(Path root) {
        ArrayNode routes = mapper.createArrayNode();
        // Look for React Router route definitions
        try {
            Path srcDir = root.resolve("src");
            if (Files.exists(srcDir)) {
                try (Stream<Path> walk = Files.walk(srcDir, 3)) {
                    walk.filter(p -> p.toString().matches(".*\\.(tsx|jsx|ts|js)$"))
                            .forEach(file -> {
                                try {
                                    String content = Files.readString(file);
                                    // Simple route detection: look for path="/..." patterns
                                    var matcher = java.util.regex.Pattern
                                            .compile("path=[\"']([^\"']+)[\"']")
                                            .matcher(content);
                                    while (matcher.find()) {
                                        String route = matcher.group(1);
                                        if (!route.startsWith("http") && !routes.toString().contains("\"" + route + "\"")) {
                                            routes.add(route);
                                        }
                                    }
                                } catch (IOException ignored) {}
                            });
                }
            }
        } catch (IOException e) {
            log.warn("Error detecting routes", e);
        }

        if (routes.isEmpty()) {
            routes.add("/");
        }
        return routes;
    }

    private ArrayNode detectEnvironmentVariables(Path root) {
        ArrayNode envVars = mapper.createArrayNode();
        try {
            // Check for .env.example or .env.sample
            for (String envFile : List.of(".env.example", ".env.sample", ".env.local.example")) {
                Path envPath = root.resolve(envFile);
                if (Files.exists(envPath)) {
                    Files.readAllLines(envPath).stream()
                            .filter(line -> !line.trim().startsWith("#") && line.contains("="))
                            .map(line -> line.split("=")[0].trim())
                            .filter(key -> !key.isEmpty())
                            .forEach(envVars::add);
                    break;
                }
            }
        } catch (IOException e) {
            log.warn("Error detecting environment variables", e);
        }
        return envVars;
    }

    private ArrayNode buildStructureSummary(Path root) {
        ArrayNode structure = mapper.createArrayNode();
        try (Stream<Path> walk = Files.walk(root, 2)) {
            walk.filter(p -> !p.equals(root))
                    .forEach(path -> {
                        String relative = root.relativize(path).toString();
                        if (Files.isDirectory(path)) {
                            structure.add(relative + "/");
                        } else {
                            structure.add(relative);
                        }
                    });
        } catch (IOException e) {
            log.warn("Error building structure summary", e);
        }
        return structure;
    }

    /**
     * Deeply analyzes codebase files to auto-generate project-specific feature specifications.
     */
    public String generateFeatureSpecFromCodebase(Path rootPath, String projectType) {
        StringBuilder sb = new StringBuilder();
        String projectName = rootPath.getFileName() != null ? rootPath.getFileName().toString() : "Application";

        Path packageJson = rootPath.resolve("package.json");
        if (Files.exists(packageJson)) {
            try {
                var tree = mapper.readTree(Files.readString(packageJson));
                if (tree.has("name") && !tree.get("name").asText().isBlank()) {
                    projectName = tree.get("name").asText();
                }
            } catch (Exception ignored) {}
        }

        // 1. Detect backend routes (Express, etc.)
        List<DetectedEndpoint> endpoints = detectBackendEndpoints(rootPath);

        // 2. Detect frontend routes (React, HTML)
        List<DetectedPageRoute> pages = detectFrontendPages(rootPath);

        boolean hasContent = false;

        if (!endpoints.isEmpty()) {
            hasContent = true;
            sb.append("# Feature: ").append(formatTitle(projectName)).append(" Endpoints\n\n");
            for (DetectedEndpoint ep : endpoints) {
                sb.append("## Scenario: ").append(ep.scenarioTitle).append("\n");
                sb.append("- Open ").append(ep.path).append("\n");
                if (ep.expectedText != null && !ep.expectedText.isBlank()) {
                    sb.append("- Expected: ").append(ep.expectedText).append("\n");
                } else {
                    sb.append("- Expected: 200\n");
                }
                sb.append("\n");
            }
        }

        if (!pages.isEmpty()) {
            hasContent = true;
            sb.append("# Feature: ").append(formatTitle(projectName)).append(" Views & Navigation\n\n");
            for (DetectedPageRoute page : pages) {
                sb.append("## Scenario: ").append(page.scenarioTitle).append("\n");
                sb.append("- Open ").append(page.path).append("\n");
                if (page.expectedText != null && !page.expectedText.isBlank()) {
                    sb.append("- Expected: ").append(page.expectedText).append("\n");
                }
                sb.append("\n");
            }
        }

        if (!hasContent) {
            sb.append("# Feature: ").append(formatTitle(projectName)).append(" Availability\n\n");
            sb.append("## Scenario: Root application health check\n");
            sb.append("- Open /\n");
            sb.append("- Expected: ").append(projectName).append("\n\n");
            sb.append("## Scenario: Service health probe\n");
            sb.append("- Open /health\n");
            sb.append("- Expected: healthy\n\n");
        }

        return sb.toString();
    }

    private static class DetectedEndpoint {
        String method;
        String path;
        String scenarioTitle;
        String expectedText;

        DetectedEndpoint(String method, String path, String scenarioTitle, String expectedText) {
            this.method = method;
            this.path = path;
            this.scenarioTitle = scenarioTitle;
            this.expectedText = expectedText;
        }
    }

    private static class DetectedPageRoute {
        String path;
        String scenarioTitle;
        String expectedText;

        DetectedPageRoute(String path, String scenarioTitle, String expectedText) {
            this.path = path;
            this.scenarioTitle = scenarioTitle;
            this.expectedText = expectedText;
        }
    }

    private List<DetectedEndpoint> detectBackendEndpoints(Path root) {
        List<DetectedEndpoint> list = new ArrayList<>();
        Set<String> seenPaths = new HashSet<>();

        Pattern routePattern = Pattern.compile(
                "(?:app|router)\\.(get|post|put|delete|patch)\\s*\\(\\s*['\"]([^'\"]+)['\"]\\s*,\\s*(.*?)(?=(?:app|router)\\.(?:get|post|put|delete|patch)|app\\.listen|module\\.exports|export |$)",
                Pattern.DOTALL
        );
        Pattern stringPattern = Pattern.compile("['\"]([^'\"]{2,60})['\"]");

        try (Stream<Path> walk = Files.walk(root, 4)) {
            walk.filter(p -> {
                String s = p.toString();
                return (s.endsWith(".js") || s.endsWith(".ts")) &&
                        !s.contains("node_modules") && !s.contains(".git") && !s.contains("dist");
            }).forEach(file -> {
                try {
                    String content = Files.readString(file);
                    Matcher matcher = routePattern.matcher(content);
                    while (matcher.find()) {
                        String method = matcher.group(1).toUpperCase();
                        String path = matcher.group(2).trim();
                        String body = matcher.group(3);

                        if (!path.startsWith("/")) path = "/" + path;
                        if (seenPaths.contains(method + " " + path)) continue;
                        seenPaths.add(method + " " + path);

                        String expected = null;
                        Matcher sm = stringPattern.matcher(body);
                        while (sm.find()) {
                            String candidate = sm.group(1).trim();
                            if (!candidate.startsWith("/") &&
                                    !candidate.equalsIgnoreCase("json") &&
                                    !candidate.equalsIgnoreCase("send") &&
                                    !candidate.equalsIgnoreCase("status") &&
                                    !candidate.equalsIgnoreCase("error") &&
                                    !candidate.equalsIgnoreCase("application/json") &&
                                    !candidate.matches("^[0-9]+$")) {
                                expected = candidate;
                                break;
                            }
                        }

                        if (expected == null || expected.isBlank()) {
                            expected = path.equals("/") ? "200" : path.replaceFirst("^/", "");
                        }

                        String title = "Verify " + method + " " + path + " endpoint";
                        list.add(new DetectedEndpoint(method, path, title, expected));
                    }
                } catch (Exception ignored) {}
            });
        } catch (Exception e) {
            log.warn("Error detecting backend endpoints", e);
        }

        return list;
    }

    private List<DetectedPageRoute> detectFrontendPages(Path root) {
        List<DetectedPageRoute> list = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        Pattern reactRoutePattern = Pattern.compile("<Route\\s+[^>]*path=['\"]([^'\"]+)['\"]");
        Pattern titlePattern = Pattern.compile("<title>(.*?)</title>", Pattern.CASE_INSENSITIVE);
        Pattern h1Pattern = Pattern.compile("<h1[^>]*>(.*?)</h1>", Pattern.CASE_INSENSITIVE);

        // Check index.html
        Path indexHtml = root.resolve("index.html");
        if (!Files.exists(indexHtml)) {
            indexHtml = root.resolve("public/index.html");
        }
        if (Files.exists(indexHtml)) {
            try {
                String content = Files.readString(indexHtml);
                String expected = null;
                Matcher tm = titlePattern.matcher(content);
                if (tm.find()) expected = tm.group(1).trim();
                if (expected == null) {
                    Matcher hm = h1Pattern.matcher(content);
                    if (hm.find()) expected = hm.group(1).replaceAll("<[^>]+>", "").trim();
                }
                seen.add("/");
                list.add(new DetectedPageRoute("/", "Verify application homepage", expected != null ? expected : "Home"));
            } catch (Exception ignored) {}
        }

        // Scan React components for Route definitions
        try (Stream<Path> walk = Files.walk(root, 4)) {
            walk.filter(p -> {
                String s = p.toString();
                return (s.endsWith(".tsx") || s.endsWith(".jsx")) &&
                        !s.contains("node_modules") && !s.contains(".git") && !s.contains("dist");
            }).forEach(file -> {
                try {
                    String content = Files.readString(file);
                    Matcher rm = reactRoutePattern.matcher(content);
                    while (rm.find()) {
                        String path = rm.group(1).trim();
                        if (!path.startsWith("/")) path = "/" + path;
                        if (path.contains("*") || seen.contains(path)) continue;
                        seen.add(path);
                        String pageName = path.equals("/") ? "Home" : path.substring(1).replace("/", " ");
                        list.add(new DetectedPageRoute(path, "Navigate to " + pageName + " page", pageName));
                    }
                } catch (Exception ignored) {}
            });
        } catch (Exception e) {
            log.warn("Error detecting frontend pages", e);
        }

        return list;
    }

    private String formatTitle(String name) {
        if (name == null || name.isBlank()) return "Application";
        String cleaned = name.replaceAll("[-_]", " ").trim();
        StringBuilder res = new StringBuilder();
        for (String word : cleaned.split("\\s+")) {
            if (!word.isEmpty()) {
                res.append(Character.toUpperCase(word.charAt(0)))
                        .append(word.substring(1).toLowerCase())
                        .append(" ");
            }
        }
        return res.toString().trim();
    }

    public static class DetectedService {
        public String name;
        public String type; // "FRONTEND", "BACKEND", "STANDALONE"
        public String directory; // "Client", "server", "."
        public String framework;
        public String packageManager;
        public String installCommand;
        public String startupCommand;
        public int port;
        public String healthCheckPath;
        public Map<String, String> scripts = new LinkedHashMap<>();
    }

    public static class ExecutionProfile {
        public String id;
        public String name;
        public String description;
        public String workingDirectory;
        public String installCommand;
        public String startupCommand;
        public int port;
        public String healthCheckPath;
        public boolean isRecommended;
    }

    public static class ArchitectureAnalysis {
        public String architecture; // "FULLSTACK_SPLIT", "FRONTEND_ONLY", "BACKEND_ONLY", "MONOLITH", "UNKNOWN"
        public String confidence; // "HIGH", "MEDIUM", "LOW"
        public String description;
        public boolean requiresConfirmation = true;
        public List<DetectedService> services = new ArrayList<>();
        public ExecutionProfile recommendedProfile;
        public List<ExecutionProfile> availableProfiles = new ArrayList<>();
        public List<String> detectionNotes = new ArrayList<>();
    }

    public ArchitectureAnalysis detectArchitecture(Path rootPath) {
        ArchitectureAnalysis analysis = new ArchitectureAnalysis();
        List<DetectedService> services = new ArrayList<>();

        // 1. Gather candidate directories (root + immediate subdirectories + packages/apps)
        List<Path> candidateDirs = new ArrayList<>();
        candidateDirs.add(rootPath);

        try (Stream<Path> stream = Files.list(rootPath)) {
            stream.filter(Files::isDirectory).forEach(dir -> {
                String name = dir.getFileName().toString();
                if (!name.startsWith(".") &&
                    !name.equals("node_modules") &&
                    !name.equals("dist") &&
                    !name.equals("build") &&
                    !name.equals("target") &&
                    !name.equals("logs") &&
                    !name.equals("__MACOSX")) {
                    candidateDirs.add(dir);

                    // Check monorepo packages/ or apps/
                    if (name.equals("packages") || name.equals("apps")) {
                        try (Stream<Path> subStream = Files.list(dir)) {
                            subStream.filter(Files::isDirectory).forEach(candidateDirs::add);
                        } catch (Exception ignored) {}
                    }
                }
            });
        } catch (Exception ignored) {}

        // 2. Inspect each candidate directory
        for (Path dir : candidateDirs) {
            DetectedService svc = inspectDirectory(dir, rootPath);
            if (svc != null) {
                services.add(svc);
            }
        }

        // If root was checked and subdirectories also had services, avoid duplicate root if root is just wrapper
        if (services.size() > 1) {
            services.removeIf(s -> s.directory.equals(".") &&
                    (services.stream().anyMatch(other -> !other.directory.equals("."))));
        }

        analysis.services = services;

        // 3. Classify Architecture & Generate Execution Profiles
        DetectedService frontend = services.stream().filter(s -> "FRONTEND".equalsIgnoreCase(s.type)).findFirst().orElse(null);
        DetectedService backend = services.stream().filter(s -> "BACKEND".equalsIgnoreCase(s.type)).findFirst().orElse(null);

        if (frontend != null && backend != null) {
            analysis.architecture = "FULLSTACK_SPLIT";
            analysis.confidence = "HIGH";
            analysis.description = "Separate Frontend ('" + frontend.directory + "') and Backend ('" + backend.directory + "') detected";
            analysis.detectionNotes.add("Identified independent frontend (" + frontend.framework + ") and backend (" + backend.framework + ") services.");

            // Profile 1: Fullstack Compound
            ExecutionProfile fullstack = new ExecutionProfile();
            fullstack.id = "fullstack";
            fullstack.name = "Fullstack Integrated (Recommended)";
            fullstack.description = "Runs both backend API (" + backend.directory + ") and frontend web app (" + frontend.directory + ") so browser tests interact with live endpoints.";
            fullstack.workingDirectory = ".";
            fullstack.installCommand = "(cd " + backend.directory + " && " + backend.installCommand + ") && (cd " + frontend.directory + " && " + frontend.installCommand + ")";
            String backendRunCmd = backend.startupCommand.contains("PORT=") ? backend.startupCommand : "PORT=" + backend.port + " " + backend.startupCommand;
            fullstack.startupCommand = "(cd " + backend.directory + " && " + backendRunCmd + ") & (cd " + frontend.directory + " && " + frontend.startupCommand + ")";
            fullstack.port = frontend.port;
            fullstack.healthCheckPath = frontend.healthCheckPath;
            fullstack.isRecommended = true;

            // Profile 2: Frontend Only
            ExecutionProfile frontOnly = new ExecutionProfile();
            frontOnly.id = "frontend_only";
            frontOnly.name = "Frontend Web UI Only (" + frontend.directory + ")";
            frontOnly.description = "Starts only the frontend application on port " + frontend.port + ".";
            frontOnly.workingDirectory = ".";
            frontOnly.installCommand = "(cd " + frontend.directory + " && " + frontend.installCommand + ")";
            frontOnly.startupCommand = "(cd " + frontend.directory + " && " + frontend.startupCommand + ")";
            frontOnly.port = frontend.port;
            frontOnly.healthCheckPath = frontend.healthCheckPath;
            frontOnly.isRecommended = false;

            // Profile 3: Backend API Only
            ExecutionProfile backOnly = new ExecutionProfile();
            backOnly.id = "backend_only";
            backOnly.name = "Backend API Only (" + backend.directory + ")";
            backOnly.description = "Starts only the backend API service on port " + backend.port + ".";
            backOnly.workingDirectory = ".";
            backOnly.installCommand = "(cd " + backend.directory + " && " + backend.installCommand + ")";
            backOnly.startupCommand = "(cd " + backend.directory + " && " + backend.startupCommand + ")";
            backOnly.port = backend.port;
            backOnly.healthCheckPath = backend.healthCheckPath;
            backOnly.isRecommended = false;

            analysis.recommendedProfile = fullstack;
            analysis.availableProfiles.add(fullstack);
            analysis.availableProfiles.add(frontOnly);
            analysis.availableProfiles.add(backOnly);

        } else if (frontend != null) {
            analysis.architecture = "FRONTEND_ONLY";
            analysis.confidence = "HIGH";
            analysis.description = "Single Frontend Application ('" + frontend.directory + "') detected";
            analysis.detectionNotes.add("Identified frontend web application powered by " + frontend.framework + ".");

            ExecutionProfile frontOnly = new ExecutionProfile();
            frontOnly.id = "frontend_only";
            frontOnly.name = "Frontend Web App";
            frontOnly.description = "Executes frontend UI on port " + frontend.port + ".";
            frontOnly.workingDirectory = frontend.directory;
            frontOnly.installCommand = frontend.installCommand;
            frontOnly.startupCommand = frontend.startupCommand;
            frontOnly.port = frontend.port;
            frontOnly.healthCheckPath = frontend.healthCheckPath;
            frontOnly.isRecommended = true;

            analysis.recommendedProfile = frontOnly;
            analysis.availableProfiles.add(frontOnly);

        } else if (backend != null) {
            analysis.architecture = "BACKEND_ONLY";
            analysis.confidence = "HIGH";
            analysis.description = "Single Backend API ('" + backend.directory + "') detected";
            analysis.detectionNotes.add("Identified backend service powered by " + backend.framework + ".");

            ExecutionProfile backOnly = new ExecutionProfile();
            backOnly.id = "backend_only";
            backOnly.name = "Backend Service";
            backOnly.description = "Executes backend API on port " + backend.port + ".";
            backOnly.workingDirectory = backend.directory;
            backOnly.installCommand = backend.installCommand;
            backOnly.startupCommand = backend.startupCommand;
            backOnly.port = backend.port;
            backOnly.healthCheckPath = backend.healthCheckPath;
            backOnly.isRecommended = true;

            analysis.recommendedProfile = backOnly;
            analysis.availableProfiles.add(backOnly);

        } else if (!services.isEmpty()) {
            DetectedService standalone = services.get(0);
            analysis.architecture = "MONOLITH";
            analysis.confidence = "HIGH";
            analysis.description = "Monolithic application ('" + standalone.directory + "') detected";

            ExecutionProfile prof = new ExecutionProfile();
            prof.id = "monolith";
            prof.name = standalone.name;
            prof.description = "Executes application on port " + standalone.port + ".";
            prof.workingDirectory = standalone.directory;
            prof.installCommand = standalone.installCommand;
            prof.startupCommand = standalone.startupCommand;
            prof.port = standalone.port;
            prof.healthCheckPath = standalone.healthCheckPath;
            prof.isRecommended = true;

            analysis.recommendedProfile = prof;
            analysis.availableProfiles.add(prof);

        } else {
            analysis.architecture = "UNKNOWN";
            analysis.confidence = "LOW";
            analysis.description = "Could not automatically determine project architecture. Please select or customize setup.";
            analysis.detectionNotes.add("No package.json, pom.xml, or build scripts detected. Please configure startup command manually.");

            // Provide default Node.js and React presets for manual confirmation
            ExecutionProfile presetNode = new ExecutionProfile();
            presetNode.id = "node_preset";
            presetNode.name = "Node.js Web App Preset";
            presetNode.description = "Standard Node.js start command";
            presetNode.workingDirectory = ".";
            presetNode.installCommand = "npm install";
            presetNode.startupCommand = "npm start";
            presetNode.port = 3000;
            presetNode.healthCheckPath = "/";
            presetNode.isRecommended = true;

            ExecutionProfile presetVite = new ExecutionProfile();
            presetVite.id = "vite_preset";
            presetVite.name = "Vite React Preset";
            presetVite.description = "Vite dev server on port 5173";
            presetVite.workingDirectory = ".";
            presetVite.installCommand = "npm install";
            presetVite.startupCommand = "npm run dev -- --host 0.0.0.0";
            presetVite.port = 5173;
            presetVite.healthCheckPath = "/";
            presetVite.isRecommended = false;

            analysis.recommendedProfile = presetNode;
            analysis.availableProfiles.add(presetNode);
            analysis.availableProfiles.add(presetVite);
        }

        return analysis;
    }

    private DetectedService inspectDirectory(Path dir, Path rootPath) {
        Path packageJson = dir.resolve("package.json");
        Path pomXml = dir.resolve("pom.xml");
        Path buildGradle = dir.resolve("build.gradle");
        Path requirementsTxt = dir.resolve("requirements.txt");

        boolean hasPackageJson = Files.exists(packageJson);
        boolean hasPom = Files.exists(pomXml);
        boolean hasGradle = Files.exists(buildGradle);
        boolean hasRequirements = Files.exists(requirementsTxt);
        boolean hasServerJs = Files.exists(dir.resolve("server.js"));
        boolean hasAppJs = Files.exists(dir.resolve("app.js"));
        boolean hasIndexHtml = Files.exists(dir.resolve("index.html")) || Files.exists(dir.resolve("public/index.html"));

        if (!hasPackageJson && !hasPom && !hasGradle && !hasRequirements && !hasServerJs && !hasAppJs && !hasIndexHtml) {
            return null;
        }

        String relPath = rootPath.relativize(dir).toString();
        if (relPath.isBlank()) relPath = ".";
        String dirNameLower = dir.getFileName() != null ? dir.getFileName().toString().toLowerCase() : "";

        DetectedService svc = new DetectedService();
        svc.directory = relPath;
        svc.packageManager = detectPackageManager(dir);

        // Read package.json if present
        String pkgContent = "";
        com.fasterxml.jackson.databind.JsonNode pkgTree = null;
        if (hasPackageJson) {
            try {
                pkgContent = Files.readString(packageJson);
                pkgTree = mapper.readTree(pkgContent);
                if (pkgTree.has("scripts") && pkgTree.get("scripts").isObject()) {
                    pkgTree.get("scripts").fields().forEachRemaining(entry -> {
                        svc.scripts.put(entry.getKey(), entry.getValue().asText());
                    });
                }
            } catch (Exception ignored) {}
        }

        // Framework Detection
        if (Files.exists(dir.resolve("vite.config.ts")) || Files.exists(dir.resolve("vite.config.js")) || pkgContent.contains("\"vite\"")) {
            svc.framework = "Vite (React)";
            svc.type = "FRONTEND";
            svc.port = detectPortInDir(dir, 5173);
            svc.healthCheckPath = "/";
            svc.installCommand = "npm install";
            svc.startupCommand = svc.scripts.containsKey("dev") ? "npm run dev -- --host 0.0.0.0" : "npm start";
        } else if (Files.exists(dir.resolve("next.config.js")) || Files.exists(dir.resolve("next.config.mjs")) || pkgContent.contains("\"next\"")) {
            svc.framework = "Next.js";
            svc.type = "FRONTEND";
            svc.port = detectPortInDir(dir, 3000);
            svc.healthCheckPath = "/";
            svc.installCommand = "npm install";
            svc.startupCommand = "npm run dev";
        } else if (pkgContent.contains("\"react-scripts\"")) {
            svc.framework = "Create React App";
            svc.type = "FRONTEND";
            svc.port = detectPortInDir(dir, 3000);
            svc.healthCheckPath = "/";
            svc.installCommand = "npm install";
            svc.startupCommand = "npm start";
        } else if (hasPom) {
            svc.framework = "Spring Boot (Maven)";
            svc.type = "BACKEND";
            svc.port = detectPortInDir(dir, 8080);
            svc.healthCheckPath = "/actuator/health";
            svc.installCommand = "mvn clean install -DskipTests";
            svc.startupCommand = "mvn spring-boot:run";
            svc.packageManager = "maven";
        } else if (hasGradle) {
            svc.framework = "Spring Boot (Gradle)";
            svc.type = "BACKEND";
            svc.port = detectPortInDir(dir, 8080);
            svc.healthCheckPath = "/actuator/health";
            svc.installCommand = "./gradlew build -x test";
            svc.startupCommand = "./gradlew bootRun";
            svc.packageManager = "gradle";
        } else if (hasRequirements || Files.exists(dir.resolve("app.py")) || Files.exists(dir.resolve("main.py"))) {
            svc.framework = "Python Service";
            svc.type = "BACKEND";
            svc.port = detectPortInDir(dir, 8000);
            svc.healthCheckPath = "/";
            svc.installCommand = "pip install -r requirements.txt";
            svc.startupCommand = Files.exists(dir.resolve("app.py")) ? "python app.py" : "python main.py";
            svc.packageManager = "pip";
        } else if (pkgContent.contains("\"express\"") || pkgContent.contains("\"fastify\"") || pkgContent.contains("\"@nestjs/core\"") || hasServerJs) {
            svc.framework = pkgContent.contains("\"@nestjs/core\"") ? "NestJS" : "Express (Node.js)";
            svc.type = "BACKEND";
            svc.port = detectPortInDir(dir, 4000);
            
            boolean hasExplicitHealth = false;
            try (var stream = Files.walk(dir, 2)) {
                hasExplicitHealth = stream.anyMatch(p -> {
                    try {
                        String s = p.toString();
                        return (s.endsWith(".js") || s.endsWith(".ts")) &&
                               !s.contains("node_modules") &&
                               Files.readString(p).contains("/health");
                    } catch (Exception e) { return false; }
                });
            } catch (Exception ignored) {}
            svc.healthCheckPath = hasExplicitHealth ? "/health" : "/";
            svc.installCommand = "npm install";
            if (svc.scripts.containsKey("start")) {
                svc.startupCommand = "npm start";
            } else if (hasServerJs) {
                svc.startupCommand = "node server.js";
            } else if (Files.exists(dir.resolve("src/index.js"))) {
                svc.startupCommand = "node src/index.js";
            } else {
                svc.startupCommand = "node index.js";
            }
        } else if (hasIndexHtml) {
            svc.framework = "Static Web / HTML";
            svc.type = "FRONTEND";
            svc.port = 5173;
            svc.healthCheckPath = "/";
            svc.installCommand = hasPackageJson ? "npm install" : "";
            svc.startupCommand = hasPackageJson && svc.scripts.containsKey("dev") ? "npm run dev" : "npx serve -l 5173";
        } else {
            svc.framework = "Node.js Application";
            svc.type = dirNameLower.contains("client") || dirNameLower.contains("front") || dirNameLower.contains("ui") ? "FRONTEND" : "BACKEND";
            svc.port = detectPortInDir(dir, 3000);
            svc.healthCheckPath = "/";
            svc.installCommand = "npm install";
            svc.startupCommand = svc.scripts.containsKey("start") ? "npm start" : (svc.scripts.containsKey("dev") ? "npm run dev" : "node index.js");
        }

        // Secondary classification refinement based on directory name
        if (dirNameLower.contains("client") || dirNameLower.contains("frontend") || dirNameLower.contains("web") || dirNameLower.contains("ui")) {
            svc.type = "FRONTEND";
        } else if (dirNameLower.contains("server") || dirNameLower.contains("backend") || dirNameLower.contains("api") || dirNameLower.contains("service")) {
            svc.type = "BACKEND";
        }

        svc.name = svc.type.equals("FRONTEND") ? "Frontend Web UI (" + relPath + ")" : "Backend API Service (" + relPath + ")";
        return svc;
    }

    private int detectPortInDir(Path dir, int fallbackPort) {
        // 1. Check .env files
        for (String envFile : List.of(".env", ".env.local", ".env.example")) {
            Path p = dir.resolve(envFile);
            if (Files.exists(p)) {
                try {
                    for (String line : Files.readAllLines(p)) {
                        line = line.trim();
                        if (line.startsWith("PORT=") || line.startsWith("VITE_PORT=") || line.startsWith("SERVER_PORT=")) {
                            String[] parts = line.split("=", 2);
                            if (parts.length > 1) {
                                int val = Integer.parseInt(parts[1].trim().replaceAll("[^0-9]", ""));
                                if (val > 0 && val < 65536) return val;
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }
        }

        // 2. Scan code files for port definitions
        Pattern portPattern = Pattern.compile("(?:PORT|port)\\s*=\\s*(\\d{2,5})|process\\.env\\.PORT\\s*\\|\\|\\s*(\\d{2,5})|\\.listen\\(\\s*(\\d{2,5})|server\\.port\\s*=\\s*(\\d{2,5})");
        try (Stream<Path> stream = Files.walk(dir, 2)) {
            var match = stream.filter(p -> {
                String s = p.toString();
                return (s.endsWith(".js") || s.endsWith(".ts") || s.endsWith(".properties") || s.endsWith(".yml")) &&
                       !s.contains("node_modules") && !s.contains(".git");
            }).findFirst();

            if (match.isPresent()) {
                String content = Files.readString(match.get());
                Matcher m = portPattern.matcher(content);
                if (m.find()) {
                    for (int g = 1; g <= m.groupCount(); g++) {
                        if (m.group(g) != null) {
                            int p = Integer.parseInt(m.group(g));
                            if (p >= 80 && p <= 65535) return p;
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        return fallbackPort;
    }
}

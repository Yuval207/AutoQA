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

        // Detect package manager
        String packageManager = detectPackageManager(rootPath);
        result.put("packageManager", packageManager);

        // Detect framework
        String framework = detectFramework(rootPath);
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

        // Warnings
        ArrayNode warnings = mapper.createArrayNode();
        if (framework.equals("unknown")) {
            warnings.add("Could not detect framework. Manual configuration may be required.");
        }
        if (packageManager.equals("unknown")) {
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
}

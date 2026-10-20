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
}

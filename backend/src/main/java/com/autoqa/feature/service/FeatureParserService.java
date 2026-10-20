package com.autoqa.feature.service;

import com.autoqa.common.exception.BadRequestException;
import com.autoqa.feature.entity.Feature;
import com.autoqa.feature.entity.FeatureSpecification;
import com.autoqa.feature.repository.FeatureRepository;
import com.autoqa.feature.repository.FeatureSpecificationRepository;
import com.autoqa.project.entity.Project;
import com.autoqa.project.service.ProjectService;
import com.autoqa.testplan.entity.TestScenario;
import com.autoqa.testplan.repository.TestScenarioRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class FeatureParserService {

    private static final Logger log = LoggerFactory.getLogger(FeatureParserService.class);
    private final ObjectMapper mapper = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
            .configure(com.fasterxml.jackson.databind.SerializationFeature.FAIL_ON_EMPTY_BEANS, false);

    private final FeatureSpecificationRepository specRepository;
    private final FeatureRepository featureRepository;
    private final TestScenarioRepository scenarioRepository;
    private final ProjectService projectService;

    public FeatureParserService(FeatureSpecificationRepository specRepository,
                                FeatureRepository featureRepository,
                                TestScenarioRepository scenarioRepository,
                                ProjectService projectService) {
        this.specRepository = specRepository;
        this.featureRepository = featureRepository;
        this.scenarioRepository = scenarioRepository;
        this.projectService = projectService;
    }

    @Transactional
    public FeatureSpecification parseAndStore(UUID projectId, UUID userId, String content, String filename) {
        Project project = projectService.getProjectEntity(projectId, userId);

        if (content == null || content.trim().isEmpty()) {
            throw new BadRequestException("Feature specification content is empty");
        }

        FeatureSpecification spec = new FeatureSpecification();
        spec.setProject(project);
        spec.setFilename(filename);
        spec.setRawContent(content);

        try {
            // Parse markdown into structured features
            List<ParsedFeature> parsedFeatures = parseMarkdown(content);

            ArrayNode parsedJson = mapper.createArrayNode();
            for (ParsedFeature pf : parsedFeatures) {
                parsedJson.add(mapper.valueToTree(pf));
            }
            spec.setParsedContent(mapper.writeValueAsString(parsedJson));
            spec.setStatus("PARSED");
            spec = specRepository.save(spec);

            // Create Feature and TestScenario entities
            for (ParsedFeature pf : parsedFeatures) {
                Feature feature = new Feature();
                feature.setSpecification(spec);
                feature.setProject(project);
                feature.setName(pf.name);
                feature.setDescription(pf.description);
                if (!pf.preconditions.isEmpty()) {
                    feature.setPreconditions(mapper.writeValueAsString(pf.preconditions));
                }
                feature = featureRepository.save(feature);

                // Create test scenarios from parsed scenarios
                for (ParsedScenario ps : pf.scenarios) {
                    TestScenario scenario = new TestScenario();
                    scenario.setFeature(feature);
                    scenario.setProject(project);
                    scenario.setName(ps.name);
                    scenario.setDescription(ps.description);
                    scenario.setScenarioType(inferScenarioType(ps));
                    scenario.setPriority(inferPriority(ps));
                    scenario.setConfidence(ps.expectedOutcomes.isEmpty() ? "LOW" : "HIGH");
                    scenario.setSource("PARSED");
                    scenario.setStatus("PENDING");

                    // Convert actions
                    ArrayNode actionsJson = mapper.createArrayNode();
                    for (String action : ps.actions) {
                        ObjectNode actionNode = parseAction(action);
                        actionsJson.add(actionNode);
                    }
                    scenario.setActions(mapper.writeValueAsString(actionsJson));

                    // Convert expected outcomes
                    ArrayNode outcomesJson = mapper.createArrayNode();
                    for (String expected : ps.expectedOutcomes) {
                        ObjectNode outcomeNode = mapper.createObjectNode();
                        outcomeNode.put("description", expected);
                        outcomeNode.put("source", "USER_SPECIFIED");
                        outcomesJson.add(outcomeNode);
                    }
                    scenario.setExpectedOutcomes(mapper.writeValueAsString(outcomesJson));

                    if (!ps.preconditions.isEmpty()) {
                        scenario.setPreconditions(mapper.writeValueAsString(ps.preconditions));
                    }

                    scenarioRepository.save(scenario);
                }
            }

            return spec;

        } catch (Exception e) {
            log.error("Failed to parse feature specification", e);
            spec.setStatus("PARSE_FAILED");
            spec = specRepository.save(spec);
            throw new BadRequestException("Failed to parse feature specification: " + e.getMessage());
        }
    }

    public List<FeatureSpecification> getSpecifications(UUID projectId) {
        return specRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
    }

    /**
     * Parses markdown feature specification into structured features and scenarios.
     */
    private List<ParsedFeature> parseMarkdown(String content) {
        List<ParsedFeature> features = new ArrayList<>();
        String[] lines = content.split("\n");

        ParsedFeature currentFeature = null;
        ParsedScenario currentScenario = null;
        String currentSection = null; // "preconditions", "scenario", null

        for (String line : lines) {
            String trimmed = line.trim();

            // Feature header: # Feature: Login
            if (trimmed.matches("^#\\s+Feature:\\s*.*") || trimmed.matches("^#\\s+.*")) {
                if (currentFeature != null) {
                    if (currentScenario != null) {
                        currentFeature.scenarios.add(currentScenario);
                    }
                    features.add(currentFeature);
                }
                currentFeature = new ParsedFeature();
                currentFeature.name = trimmed.replaceFirst("^#+\\s*(Feature:\\s*)?", "").trim();
                currentScenario = null;
                currentSection = null;
            }
            // Scenario header: ## Scenario: Successful login
            else if (trimmed.matches("^##\\s+Scenario:\\s*.*")) {
                if (currentFeature == null) {
                    currentFeature = new ParsedFeature();
                    currentFeature.name = "Default Feature";
                }
                if (currentScenario != null) {
                    currentFeature.scenarios.add(currentScenario);
                }
                currentScenario = new ParsedScenario();
                currentScenario.name = trimmed.replaceFirst("^##\\s*Scenario:\\s*", "").trim();
                currentSection = "scenario";
            }
            // Preconditions section
            else if (trimmed.matches("^##\\s+Preconditions.*")) {
                currentSection = "preconditions";
            }
            // List items
            else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                String item = trimmed.substring(2).trim();

                if ("preconditions".equals(currentSection)) {
                    if (currentScenario != null) {
                        currentScenario.preconditions.add(item);
                    } else if (currentFeature != null) {
                        currentFeature.preconditions.add(item);
                    }
                } else if (currentScenario != null) {
                    if (item.toLowerCase().startsWith("expected:")) {
                        String expected = item.substring("expected:".length()).trim();
                        currentScenario.expectedOutcomes.add(expected);
                    } else {
                        currentScenario.actions.add(item);
                    }
                }
            }
        }

        // Add last feature/scenario
        if (currentFeature != null) {
            if (currentScenario != null) {
                currentFeature.scenarios.add(currentScenario);
            }
            features.add(currentFeature);
        }

        if (features.isEmpty()) {
            throw new BadRequestException("No features found in the specification. " +
                    "Use '# Feature: Name' headers and '## Scenario: Name' sub-headers.");
        }

        return features;
    }

    private ObjectNode parseAction(String actionText) {
        ObjectNode node = mapper.createObjectNode();
        String lower = actionText.toLowerCase();

        if (lower.startsWith("open ") || lower.startsWith("navigate to ") || lower.startsWith("go to ")) {
            node.put("type", "NAVIGATE");
            String target = actionText.replaceFirst("(?i)(open|navigate to|go to)\\s+", "").trim();
            node.put("target", target);
        } else if (lower.startsWith("click ") || lower.startsWith("press ")) {
            node.put("type", "CLICK");
            String target = actionText.replaceFirst("(?i)(click|press)\\s+(on\\s+)?", "").trim();
            node.put("target", target);
        } else if (lower.startsWith("enter ") || lower.startsWith("type ") || lower.startsWith("fill ") || lower.startsWith("input ")) {
            node.put("type", "FILL");
            // Pattern: "Enter <value> in <field>" or "Enter valid credentials"
            Pattern p = Pattern.compile("(?i)(?:enter|type|fill|input)\\s+(.+?)\\s+(?:in|into|on)\\s+(.+)");
            Matcher m = p.matcher(actionText);
            if (m.matches()) {
                node.put("value", m.group(1).trim());
                node.put("target", m.group(2).trim());
            } else {
                node.put("value", actionText.replaceFirst("(?i)(enter|type|fill|input)\\s+", "").trim());
                node.put("target", "");
            }
        } else if (lower.startsWith("select ")) {
            node.put("type", "SELECT");
            node.put("target", actionText.replaceFirst("(?i)select\\s+", "").trim());
        } else if (lower.startsWith("check ") || lower.startsWith("uncheck ")) {
            node.put("type", lower.startsWith("uncheck") ? "UNCHECK" : "CHECK");
            node.put("target", actionText.replaceFirst("(?i)(un)?check\\s+", "").trim());
        } else if (lower.startsWith("submit ")) {
            node.put("type", "SUBMIT");
            node.put("target", actionText.replaceFirst("(?i)submit\\s+", "").trim());
        } else {
            node.put("type", "CUSTOM");
            node.put("description", actionText);
        }

        return node;
    }

    private String inferScenarioType(ParsedScenario scenario) {
        String nameLower = scenario.name.toLowerCase();
        if (nameLower.contains("invalid") || nameLower.contains("wrong") || nameLower.contains("fail") || nameLower.contains("error")) {
            return "NEGATIVE";
        }
        if (nameLower.contains("boundary") || nameLower.contains("limit") || nameLower.contains("max") || nameLower.contains("min")) {
            return "BOUNDARY";
        }
        return "POSITIVE";
    }

    private String inferPriority(ParsedScenario scenario) {
        String nameLower = scenario.name.toLowerCase();
        if (nameLower.contains("login") || nameLower.contains("auth") || nameLower.contains("critical")) {
            return "HIGH";
        }
        return "MEDIUM";
    }

    // Internal parsed structures
    public static class ParsedFeature {
        public String name = "";
        public String description = "";
        public List<String> preconditions = new ArrayList<>();
        public List<ParsedScenario> scenarios = new ArrayList<>();

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public List<String> getPreconditions() { return preconditions; }
        public void setPreconditions(List<String> preconditions) { this.preconditions = preconditions; }
        public List<ParsedScenario> getScenarios() { return scenarios; }
        public void setScenarios(List<ParsedScenario> scenarios) { this.scenarios = scenarios; }
    }

    public static class ParsedScenario {
        public String name = "";
        public String description = "";
        public List<String> preconditions = new ArrayList<>();
        public List<String> actions = new ArrayList<>();
        public List<String> expectedOutcomes = new ArrayList<>();

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public List<String> getPreconditions() { return preconditions; }
        public void setPreconditions(List<String> preconditions) { this.preconditions = preconditions; }
        public List<String> getActions() { return actions; }
        public void setActions(List<String> actions) { this.actions = actions; }
        public List<String> getExpectedOutcomes() { return expectedOutcomes; }
        public void setExpectedOutcomes(List<String> expectedOutcomes) { this.expectedOutcomes = expectedOutcomes; }
    }
}

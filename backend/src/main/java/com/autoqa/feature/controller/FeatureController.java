package com.autoqa.feature.controller;

import com.autoqa.auth.entity.User;
import com.autoqa.feature.entity.Feature;
import com.autoqa.feature.entity.FeatureSpecification;
import com.autoqa.feature.repository.FeatureRepository;
import com.autoqa.feature.service.FeatureParserService;
import com.autoqa.project.service.ProjectService;
import com.autoqa.testplan.entity.TestScenario;
import com.autoqa.testplan.repository.TestScenarioRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/projects/{projectId}")
@Transactional
public class FeatureController {

    private final FeatureParserService parserService;
    private final FeatureRepository featureRepository;
    private final TestScenarioRepository scenarioRepository;
    private final ProjectService projectService;

    public FeatureController(FeatureParserService parserService,
                             FeatureRepository featureRepository,
                             TestScenarioRepository scenarioRepository,
                             ProjectService projectService) {
        this.parserService = parserService;
        this.featureRepository = featureRepository;
        this.scenarioRepository = scenarioRepository;
        this.projectService = projectService;
    }

    @PostMapping({"/features/upload", "/specifications/upload"})
    public ResponseEntity<Map<String, Object>> uploadFeatureSpec(
            @PathVariable UUID projectId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User user) throws IOException {
        projectService.verifyOwnership(projectId, user.getId());
        String content = new String(file.getBytes(), StandardCharsets.UTF_8);
        FeatureSpecification spec = parserService.parseAndStore(
                projectId, user.getId(), content, file.getOriginalFilename());
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("id", spec.getId());
        resp.put("specificationId", spec.getId());
        resp.put("filename", spec.getFilename());
        resp.put("status", spec.getStatus());
        resp.put("rawContent", spec.getRawContent() != null ? spec.getRawContent() : "");
        resp.put("parsedContent", spec.getParsedContent() != null ? spec.getParsedContent() : "");
        resp.put("createdAt", spec.getCreatedAt());
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    @PostMapping({"/specifications", "/features/content"})
    public ResponseEntity<Map<String, Object>> submitFeatureContent(
            @PathVariable UUID projectId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        String content = body.get("content");
        String filename = body.getOrDefault("filename", "features.md");
        FeatureSpecification spec = parserService.parseAndStore(
                projectId, user.getId(), content, filename);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("id", spec.getId());
        resp.put("specificationId", spec.getId());
        resp.put("filename", spec.getFilename());
        resp.put("status", spec.getStatus());
        resp.put("rawContent", spec.getRawContent() != null ? spec.getRawContent() : "");
        resp.put("parsedContent", spec.getParsedContent() != null ? spec.getParsedContent() : "");
        resp.put("createdAt", spec.getCreatedAt());
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    @GetMapping("/features")
    public ResponseEntity<List<Map<String, Object>>> getFeatures(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        List<Feature> features = featureRepository.findByProjectIdOrderByCreatedAt(projectId);
        List<Map<String, Object>> result = features.stream()
                .map(f -> {
                    List<TestScenario> scenarios = scenarioRepository.findByFeatureIdOrderByCreatedAt(f.getId());
                    Map<String, Object> featureMap = new LinkedHashMap<>();
                    featureMap.put("id", f.getId());
                    featureMap.put("name", f.getName());
                    featureMap.put("description", f.getDescription());
                    featureMap.put("preconditions", f.getPreconditions());
                    featureMap.put("createdAt", f.getCreatedAt());
                    featureMap.put("scenarios", scenarios.stream().map(s -> {
                        Map<String, Object> sm = new LinkedHashMap<>();
                        sm.put("id", s.getId());
                        sm.put("featureId", f.getId());
                        sm.put("featureName", f.getName());
                        sm.put("name", s.getName());
                        sm.put("description", s.getDescription());
                        sm.put("scenarioType", s.getScenarioType());
                        sm.put("priority", s.getPriority());
                        sm.put("status", s.getStatus());
                        sm.put("confidence", s.getConfidence());
                        sm.put("source", s.getSource());
                        sm.put("actions", s.getActions());
                        sm.put("expectedOutcomes", s.getExpectedOutcomes());
                        sm.put("preconditions", s.getPreconditions());
                        sm.put("createdAt", s.getCreatedAt());
                        return sm;
                    }).toList());
                    return featureMap;
                }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/scenarios")
    public ResponseEntity<List<Map<String, Object>>> getScenarios(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        List<TestScenario> scenarios = scenarioRepository.findByProjectIdOrderByCreatedAt(projectId);
        List<Map<String, Object>> result = scenarios.stream().map(s -> {
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("id", s.getId());
            sm.put("featureId", s.getFeature() != null ? s.getFeature().getId() : null);
            sm.put("featureName", s.getFeature() != null ? s.getFeature().getName() : "");
            sm.put("name", s.getName());
            sm.put("description", s.getDescription());
            sm.put("scenarioType", s.getScenarioType());
            sm.put("priority", s.getPriority());
            sm.put("status", s.getStatus());
            sm.put("confidence", s.getConfidence());
            sm.put("source", s.getSource());
            sm.put("actions", s.getActions());
            sm.put("expectedOutcomes", s.getExpectedOutcomes());
            sm.put("preconditions", s.getPreconditions());
            sm.put("createdAt", s.getCreatedAt());
            return sm;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/generate-scenarios")
    public ResponseEntity<List<Map<String, Object>>> generateScenarios(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        List<TestScenario> scenarios = projectService.generateScenariosFromCodebase(projectId, user.getId());
        List<Map<String, Object>> result = scenarios.stream().map(s -> {
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("id", s.getId());
            sm.put("featureId", s.getFeature() != null ? s.getFeature().getId() : null);
            sm.put("featureName", s.getFeature() != null ? s.getFeature().getName() : "");
            sm.put("name", s.getName());
            sm.put("description", s.getDescription());
            sm.put("scenarioType", s.getScenarioType());
            sm.put("priority", s.getPriority());
            sm.put("status", s.getStatus());
            sm.put("confidence", s.getConfidence());
            sm.put("source", s.getSource());
            sm.put("actions", s.getActions());
            sm.put("expectedOutcomes", s.getExpectedOutcomes());
            sm.put("preconditions", s.getPreconditions());
            sm.put("createdAt", s.getCreatedAt());
            return sm;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/specifications")
    public ResponseEntity<List<Map<String, Object>>> getSpecifications(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        var specs = parserService.getSpecifications(projectId);
        return ResponseEntity.ok(specs.stream().map(s -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("filename", s.getFilename());
            m.put("status", s.getStatus());
            m.put("rawContent", s.getRawContent());
            m.put("parsedContent", s.getParsedContent());
            m.put("createdAt", s.getCreatedAt());
            return m;
        }).toList());
    }

    @PutMapping({"/scenarios/{scenarioId}/approve", "/scenarios/{scenarioId}/status"})
    public ResponseEntity<Map<String, String>> updateScenarioStatus(
            @PathVariable UUID projectId,
            @PathVariable UUID scenarioId,
            @RequestBody(required = false) Map<String, String> body,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        TestScenario scenario = scenarioRepository.findById(scenarioId)
                .orElseThrow(() -> new com.autoqa.common.exception.ResourceNotFoundException("Scenario not found"));
        String newStatus = body != null ? body.get("status") : null;
        if (newStatus == null) {
            newStatus = "APPROVED";
        }
        if (List.of("PENDING", "APPROVED", "EXCLUDED", "REJECTED").contains(newStatus)) {
            scenario.setStatus(newStatus);
            scenarioRepository.save(scenario);
        }
        return ResponseEntity.ok(Map.of("status", scenario.getStatus()));
    }

    @RequestMapping(value = "/scenarios/approve-all", method = {RequestMethod.POST, RequestMethod.PUT})
    public ResponseEntity<Map<String, Object>> approveAllScenarios(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        var scenarios = scenarioRepository.findByProjectIdOrderByCreatedAt(projectId);
        int count = 0;
        for (TestScenario s : scenarios) {
            if ("PENDING".equals(s.getStatus())) {
                s.setStatus("APPROVED");
                scenarioRepository.save(s);
                count++;
            }
        }
        return ResponseEntity.ok(Map.of("approvedCount", count));
    }
}


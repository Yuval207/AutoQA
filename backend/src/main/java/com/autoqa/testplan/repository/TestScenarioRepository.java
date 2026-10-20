package com.autoqa.testplan.repository;

import com.autoqa.testplan.entity.TestScenario;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface TestScenarioRepository extends JpaRepository<TestScenario, UUID> {
    @EntityGraph(attributePaths = {"feature"})
    List<TestScenario> findByProjectIdOrderByCreatedAt(UUID projectId);

    @EntityGraph(attributePaths = {"feature"})
    List<TestScenario> findByProjectIdAndStatusOrderByCreatedAt(UUID projectId, String status);

    List<TestScenario> findByFeatureIdOrderByCreatedAt(UUID featureId);
    long countByProjectId(UUID projectId);
}

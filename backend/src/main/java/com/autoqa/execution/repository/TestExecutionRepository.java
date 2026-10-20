package com.autoqa.execution.repository;

import com.autoqa.execution.entity.TestExecution;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface TestExecutionRepository extends JpaRepository<TestExecution, UUID> {
    @EntityGraph(attributePaths = {"scenario", "scenario.feature"})
    List<TestExecution> findByTestRunIdOrderByCreatedAt(UUID testRunId);
}

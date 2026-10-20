package com.autoqa.execution.repository;

import com.autoqa.execution.entity.TestStepResult;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface TestStepResultRepository extends JpaRepository<TestStepResult, UUID> {
    List<TestStepResult> findByExecutionIdOrderByStepIndex(UUID executionId);
}

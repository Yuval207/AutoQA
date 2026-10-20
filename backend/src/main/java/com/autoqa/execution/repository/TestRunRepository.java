package com.autoqa.execution.repository;

import com.autoqa.execution.entity.TestRun;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TestRunRepository extends JpaRepository<TestRun, UUID> {
    List<TestRun> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    Optional<TestRun> findFirstByProjectIdOrderByCreatedAtDesc(UUID projectId);
    List<TestRun> findByStatusIn(List<String> statuses);
    Optional<TestRun> findFirstByStatusOrderByCreatedAt(String status);
    long countByProjectId(UUID projectId);
}

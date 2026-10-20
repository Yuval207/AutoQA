package com.autoqa.finding.repository;

import com.autoqa.finding.entity.BugFinding;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface BugFindingRepository extends JpaRepository<BugFinding, UUID> {
    List<BugFinding> findByTestRunIdOrderByCreatedAt(UUID testRunId);
    List<BugFinding> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    long countByProjectIdAndStatus(UUID projectId, String status);
}

package com.autoqa.feature.repository;

import com.autoqa.feature.entity.FeatureSpecification;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface FeatureSpecificationRepository extends JpaRepository<FeatureSpecification, UUID> {
    List<FeatureSpecification> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    void deleteByProjectId(UUID projectId);
}

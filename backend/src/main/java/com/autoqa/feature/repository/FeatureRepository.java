package com.autoqa.feature.repository;

import com.autoqa.feature.entity.Feature;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface FeatureRepository extends JpaRepository<Feature, UUID> {
    List<Feature> findByProjectIdOrderByCreatedAt(UUID projectId);
    List<Feature> findBySpecificationId(UUID specificationId);
    void deleteByProjectId(UUID projectId);
}

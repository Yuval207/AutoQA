package com.autoqa.project.repository;

import com.autoqa.project.entity.EnvironmentConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface EnvironmentConfigRepository extends JpaRepository<EnvironmentConfiguration, UUID> {
    Optional<EnvironmentConfiguration> findByProjectId(UUID projectId);
}

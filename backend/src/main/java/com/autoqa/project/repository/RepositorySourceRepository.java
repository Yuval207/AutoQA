package com.autoqa.project.repository;

import com.autoqa.project.entity.RepositorySource;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RepositorySourceRepository extends JpaRepository<RepositorySource, UUID> {
    List<RepositorySource> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
    Optional<RepositorySource> findFirstByProjectIdOrderByCreatedAtDesc(UUID projectId);
}

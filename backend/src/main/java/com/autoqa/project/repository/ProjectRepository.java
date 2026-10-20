package com.autoqa.project.repository;

import com.autoqa.project.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
    List<Project> findByUserIdAndStatusOrderByCreatedAtDesc(UUID userId, String status);
    List<Project> findByUserIdOrderByCreatedAtDesc(UUID userId);
    Optional<Project> findByIdAndUserId(UUID id, UUID userId);
}

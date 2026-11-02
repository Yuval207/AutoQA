package com.autoqa;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class AutoQaApplication {
    public static void main(String[] args) {
        resetLogFile();
        SpringApplication.run(AutoQaApplication.class, args);
    }

    // Must run before Spring initializes logging; mirrors logging.file.name default in application.yml
    private static void resetLogFile() {
        String logFile = System.getenv().getOrDefault("LOG_FILE", "../logs/server.log");
        try {
            Path path = Paths.get(logFile);
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            Files.write(path, new byte[0]);
        } catch (IOException e) {
            System.err.println("Could not reset log file " + logFile + ": " + e.getMessage());
        }
    }
}

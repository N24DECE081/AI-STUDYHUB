package com.studyhub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication(scanBasePackages = {
        "com.studyhub.config",
        "com.studyhub.controller",
        "com.studyhub.service",
        "com.studyhub.repository"
})
@EntityScan("com.studyhub.model")
@EnableJpaRepositories("com.studyhub.repository")
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }

}

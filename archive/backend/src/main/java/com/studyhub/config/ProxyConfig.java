package com.studyhub.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class ProxyConfig {

    @Value("${backend.python-api:http://127.0.0.1:5000}")
    private String pythonApiUrl;

    @Value("${backend.ai-service:http://127.0.0.1:8081}")
    private String aiServiceUrl;

    @Bean(name = "pythonApiClient")
    public WebClient pythonApiClient() {
        return WebClient.builder()
                .baseUrl(pythonApiUrl)
                .build();
    }

    @Bean(name = "aiServiceApiClient")
    public WebClient aiServiceApiClient() {
        return WebClient.builder()
                .baseUrl(aiServiceUrl)
                .build();
    }
}

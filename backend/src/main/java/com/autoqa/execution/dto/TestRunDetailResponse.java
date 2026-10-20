package com.autoqa.execution.dto;

import java.util.List;

public record TestRunDetailResponse(
        TestRunResponse run,
        List<TestExecutionDetail> executions,
        List<BugFindingDetail> findings
) {}

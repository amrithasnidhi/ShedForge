from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TimetableConflict(BaseModel):
    id: str
    type: Literal[
        "faculty-overlap",
        "room-overlap",
        "section-overlap",
        "elective-overlap",
        "capacity",
        "availability",
        "course-faculty-inconsistency",
    ]
    severity: Literal["high", "medium", "low"]
    description: str
    affected_slots: list[str] = Field(default_factory=list, alias="affectedSlots")
    resolution: str
    resolved: bool = False

    model_config = ConfigDict(populate_by_name=True)


class ConflictDecisionIn(BaseModel):
    decision: Literal["yes", "no"]
    note: str | None = Field(default=None, max_length=500)


class ConflictDecisionOut(BaseModel):
    conflict_id: str
    decision: Literal["yes", "no"]
    resolved: bool
    message: str
    published_version_label: str | None = None


class ConstraintStatus(BaseModel):
    name: str
    description: str
    satisfaction: float
    status: Literal["satisfied", "partial", "violated"]


class WorkloadChartEntry(BaseModel):
    id: str
    name: str
    full_name: str = Field(alias="fullName")
    department: str
    workload: float
    max: float
    overloaded: bool

    model_config = ConfigDict(populate_by_name=True)


class DailyWorkloadEntry(BaseModel):
    day: str
    loads: dict[str, float]
    total: float


class PerformanceTrendEntry(BaseModel):
    semester: str
    satisfaction: float
    conflicts: int


class OptimizationSummary(BaseModel):
    constraint_satisfaction: float = Field(alias="constraintSatisfaction")
    conflicts_detected: int = Field(alias="conflictsDetected")
    optimization_technique: str = Field(alias="optimizationTechnique")
    alternatives_generated: int = Field(alias="alternativesGenerated")
    last_generated: str | None = Field(default=None, alias="lastGenerated")
    total_iterations: int = Field(alias="totalIterations")
    compute_time: str = Field(alias="computeTime")

    model_config = ConfigDict(populate_by_name=True)


class TimetableAnalytics(BaseModel):
    optimization_summary: OptimizationSummary = Field(alias="optimizationSummary")
    constraint_data: list[ConstraintStatus] = Field(default_factory=list, alias="constraintData")
    workload_chart_data: list[WorkloadChartEntry] = Field(default_factory=list, alias="workloadChartData")
    daily_workload_data: list[DailyWorkloadEntry] = Field(default_factory=list, alias="dailyWorkloadData")
    performance_trend_data: list[PerformanceTrendEntry] = Field(default_factory=list, alias="performanceTrendData")

    model_config = ConfigDict(populate_by_name=True)

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.settings import TIME_PATTERN, parse_time_to_minutes


class SemesterConstraintBase(BaseModel):
    term_number: int = Field(ge=1, le=20)
    earliest_start_time: str = Field(min_length=4, max_length=5)
    latest_end_time: str = Field(min_length=4, max_length=5)
    max_hours_per_day: int = Field(ge=1, le=24)
    max_hours_per_week: int = Field(ge=1, le=200)
    min_break_minutes: int = Field(ge=0, le=180)
    max_consecutive_hours: int = Field(ge=1, le=12)

    @field_validator("earliest_start_time", "latest_end_time")
    @classmethod
    def validate_time_format(cls, value: str) -> str:
        if not TIME_PATTERN.match(value):
            raise ValueError("Time must be in HH:MM 24-hour format")
        return value

    @model_validator(mode="after")
    def validate_time_order(self) -> "SemesterConstraintBase":
        start = parse_time_to_minutes(self.earliest_start_time)
        end = parse_time_to_minutes(self.latest_end_time)
        if end <= start:
            raise ValueError("Latest end time must be after earliest start time")
        if self.max_consecutive_hours > self.max_hours_per_day:
            raise ValueError("Max consecutive hours cannot exceed max hours per day")
        return self


class SemesterConstraintUpsert(SemesterConstraintBase):
    pass


class SemesterConstraintOut(SemesterConstraintBase):
    id: str

    model_config = {"from_attributes": True}

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.timetable_issue import IssueCategory, IssueStatus


class IssueCreate(BaseModel):
    category: IssueCategory = IssueCategory.other
    affected_slot_id: str | None = Field(default=None, max_length=100)
    description: str = Field(min_length=5, max_length=5000)


class IssueUpdate(BaseModel):
    status: IssueStatus | None = None
    resolution_notes: str | None = Field(default=None, max_length=5000)
    assigned_to_id: str | None = Field(default=None, max_length=36)


class IssueOut(BaseModel):
    id: str
    reporter_id: str
    category: IssueCategory
    affected_slot_id: str | None
    description: str
    status: IssueStatus
    resolution_notes: str | None
    assigned_to_id: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}

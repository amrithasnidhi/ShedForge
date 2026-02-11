import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SAEnum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class CourseType(str, Enum):
    theory = "theory"
    lab = "lab"
    elective = "elective"


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[CourseType] = mapped_column(SAEnum(CourseType, name="course_type"), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    duration_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    sections: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    hours_per_week: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    semester_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    batch_year: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    theory_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    lab_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tutorial_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    faculty_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

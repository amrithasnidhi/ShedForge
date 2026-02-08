import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SAEnum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ProgramDegree(str, Enum):
    BS = "BS"
    MS = "MS"
    PhD = "PhD"


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    department: Mapped[str] = mapped_column(String(200), nullable=False)
    degree: Mapped[ProgramDegree] = mapped_column(SAEnum(ProgramDegree, name="program_degree"), nullable=False)
    duration_years: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    sections: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_students: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

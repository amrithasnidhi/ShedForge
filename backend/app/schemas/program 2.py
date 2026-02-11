from pydantic import BaseModel, Field

from app.models.program import ProgramDegree


class ProgramBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=20)
    department: str = Field(min_length=1, max_length=200)
    degree: ProgramDegree
    duration_years: int = Field(ge=1, le=10)
    sections: int = Field(ge=1, le=50)
    # Allow realistic institution/program enrollment sizes.
    total_students: int = Field(ge=0, le=100000)


class ProgramCreate(ProgramBase):
    pass


class ProgramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=1, max_length=20)
    department: str | None = Field(default=None, min_length=1, max_length=200)
    degree: ProgramDegree | None = None
    duration_years: int | None = Field(default=None, ge=1, le=10)
    sections: int | None = Field(default=None, ge=1, le=50)
    total_students: int | None = Field(default=None, ge=0, le=100000)


class ProgramOut(ProgramBase):
    id: str

    model_config = {"from_attributes": True}

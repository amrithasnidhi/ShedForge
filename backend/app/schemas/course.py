from pydantic import BaseModel, Field, model_validator

from app.models.course import CourseType


class CourseBase(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    type: CourseType
    credits: int = Field(ge=0, le=40)
    duration_hours: int = Field(ge=1, le=8)
    sections: int = Field(ge=1, le=50)
    hours_per_week: int = Field(ge=1, le=40)
    semester_number: int = Field(default=1, ge=1, le=20)
    batch_year: int = Field(default=1, ge=1, le=4)
    theory_hours: int = Field(default=0, ge=0, le=40)
    lab_hours: int = Field(default=0, ge=0, le=40)
    tutorial_hours: int = Field(default=0, ge=0, le=40)
    faculty_id: str | None = Field(default=None, max_length=36)

    @model_validator(mode="after")
    def validate_credit_split(self) -> "CourseBase":
        split_total = self.theory_hours + self.lab_hours + self.tutorial_hours
        if split_total == 0:
            if self.type == CourseType.lab:
                self.lab_hours = self.hours_per_week
            else:
                self.theory_hours = self.hours_per_week
        elif split_total != self.hours_per_week:
            raise ValueError("hours_per_week must equal theory_hours + lab_hours + tutorial_hours")

        expected = self.theory_hours + self.lab_hours + self.tutorial_hours
        if expected != self.hours_per_week:
            raise ValueError("hours_per_week must equal theory_hours + lab_hours + tutorial_hours")

        # Keep persisted data canonical: credits and weekly hours remain equal.
        if self.credits != self.hours_per_week:
            self.credits = self.hours_per_week

        if self.type == CourseType.lab:
            if self.lab_hours <= 0:
                raise ValueError("Lab courses require lab_hours > 0")
            if self.theory_hours != 0 or self.tutorial_hours != 0:
                raise ValueError("Lab courses must have theory_hours = 0 and tutorial_hours = 0")
        return self


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    type: CourseType | None = None
    credits: int | None = Field(default=None, ge=0, le=40)
    duration_hours: int | None = Field(default=None, ge=1, le=8)
    sections: int | None = Field(default=None, ge=1, le=50)
    hours_per_week: int | None = Field(default=None, ge=1, le=40)
    semester_number: int | None = Field(default=None, ge=1, le=20)
    batch_year: int | None = Field(default=None, ge=1, le=4)
    theory_hours: int | None = Field(default=None, ge=0, le=40)
    lab_hours: int | None = Field(default=None, ge=0, le=40)
    tutorial_hours: int | None = Field(default=None, ge=0, le=40)
    faculty_id: str | None = Field(default=None, max_length=36)


class CourseOut(CourseBase):
    id: str

    model_config = {"from_attributes": True}

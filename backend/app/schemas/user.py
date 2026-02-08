from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.user import UserRole


class UserBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    role: UserRole
    department: str | None = None
    section_name: str | None = Field(default=None, min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Name cannot be empty")
        return trimmed

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("department")
    @classmethod
    def normalize_department(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @field_validator("section_name")
    @classmethod
    def normalize_section_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    preferred_subject_codes: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("preferred_subject_codes")
    @classmethod
    def normalize_preferred_subject_codes(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        normalized_codes: list[str] = []
        for item in value:
            code = item.strip().upper()
            if not code:
                continue
            if len(code) > 50:
                raise ValueError("Preferred subject code length cannot exceed 50 characters")
            if code in seen:
                continue
            seen.add(code)
            normalized_codes.append(code)
        return normalized_codes

    @model_validator(mode="after")
    def validate_role_specific_requirements(self) -> "UserCreate":
        if self.role == UserRole.student and not self.section_name:
            raise ValueError("section_name is required for student registration")
        if self.role != UserRole.student:
            self.section_name = None
        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class LoginOtpRequest(UserLogin):
    pass


class LoginOtpChallengeOut(BaseModel):
    challenge_id: str
    email: EmailStr
    expires_in_seconds: int = Field(ge=1)
    message: str
    otp_hint: str | None = None


class LoginOtpVerify(BaseModel):
    challenge_id: str = Field(min_length=1, max_length=36)
    otp_code: str = Field(pattern=r"^\d{6}$")


class UserOut(UserBase):
    id: str

    model_config = {"from_attributes": True}


class StudentListOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    department: str | None = None
    section_name: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.user import User, UserRole
from app.schemas.user import StudentListOut

router = APIRouter()


@router.get("/students", response_model=list[StudentListOut])
def list_students(
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> list[StudentListOut]:
    students = (
        db.execute(
            select(User)
            .where(User.role == UserRole.student)
            .order_by(User.section_name.asc(), User.name.asc())
        )
        .scalars()
        .all()
    )
    return list(students)

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.semester_constraint import SemesterConstraint
from app.models.user import User, UserRole
from app.schemas.constraints import SemesterConstraintOut, SemesterConstraintUpsert
from app.services.notifications import notify_admin_update

router = APIRouter()


@router.get("/constraints/semesters", response_model=list[SemesterConstraintOut])
def list_semester_constraints(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SemesterConstraintOut]:
    constraints = db.execute(select(SemesterConstraint).order_by(SemesterConstraint.term_number)).scalars().all()
    return list(constraints)


@router.get("/constraints/semesters/{term_number}", response_model=SemesterConstraintOut)
def get_semester_constraint(
    term_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SemesterConstraintOut:
    constraint = (
        db.execute(select(SemesterConstraint).where(SemesterConstraint.term_number == term_number))
        .scalars()
        .first()
    )
    if constraint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester constraint not found")
    return constraint


@router.put("/constraints/semesters/{term_number}", response_model=SemesterConstraintOut)
def upsert_semester_constraint(
    term_number: int,
    payload: SemesterConstraintUpsert,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> SemesterConstraintOut:
    if payload.term_number != term_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Term number mismatch")

    constraint = (
        db.execute(select(SemesterConstraint).where(SemesterConstraint.term_number == term_number))
        .scalars()
        .first()
    )
    data = payload.model_dump()
    if constraint is None:
        constraint = SemesterConstraint(**data)
        db.add(constraint)
        notify_admin_update(
            db,
            title="Semester Constraint Added",
            message=(
                f"{current_user.name} added semester {term_number} scheduling constraints."
            ),
            actor_user_id=current_user.id,
        )
    else:
        for key, value in data.items():
            setattr(constraint, key, value)
        notify_admin_update(
            db,
            title="Semester Constraint Updated",
            message=(
                f"{current_user.name} updated semester {term_number} scheduling constraints."
            ),
            actor_user_id=current_user.id,
        )

    db.commit()
    db.refresh(constraint)
    return constraint


@router.delete("/constraints/semesters/{term_number}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester_constraint(
    term_number: int,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> None:
    constraint = (
        db.execute(select(SemesterConstraint).where(SemesterConstraint.term_number == term_number))
        .scalars()
        .first()
    )
    if constraint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester constraint not found")
    notify_admin_update(
        db,
        title="Semester Constraint Removed",
        message=(
            f"{current_user.name} removed semester {term_number} scheduling constraints."
        ),
        actor_user_id=current_user.id,
    )
    db.delete(constraint)
    db.commit()

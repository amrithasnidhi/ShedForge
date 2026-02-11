from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.notification import NotificationType
from app.models.timetable_issue import TimetableIssue
from app.models.user import User, UserRole
from app.schemas.issue import IssueCreate, IssueOut, IssueUpdate
from app.services.audit import log_activity
from app.services.notifications import notify_all_users

router = APIRouter()


@router.get("/issues", response_model=list[IssueOut])
def list_issues(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[IssueOut]:
    query = select(TimetableIssue).order_by(TimetableIssue.created_at.desc())
    if current_user.role not in {UserRole.admin, UserRole.scheduler}:
        query = query.where(TimetableIssue.reporter_id == current_user.id)
    return list(db.execute(query).scalars())


@router.post("/issues", response_model=IssueOut, status_code=status.HTTP_201_CREATED)
def create_issue(
    payload: IssueCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IssueOut:
    if current_user.role == UserRole.student and not (current_user.section_name or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student section is required before submitting timetable requests.",
        )
    issue = TimetableIssue(
        reporter_id=current_user.id,
        category=payload.category,
        affected_slot_id=payload.affected_slot_id,
        description=payload.description.strip(),
    )
    db.add(issue)
    notify_all_users(
        db,
        title="New Timetable Issue Reported",
        message=f"{current_user.name} reported a timetable issue ({payload.category.value}).",
        notification_type=NotificationType.issue,
        exclude_user_id=current_user.id,
    )
    log_activity(
        db,
        user=current_user,
        action="issue.create",
        entity_type="issue",
        details={"category": payload.category.value, "affected_slot_id": payload.affected_slot_id},
    )
    db.commit()
    db.refresh(issue)
    return issue


@router.put("/issues/{issue_id}", response_model=IssueOut)
def update_issue(
    issue_id: str,
    payload: IssueUpdate,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> IssueOut:
    issue = db.get(TimetableIssue, issue_id)
    if issue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(issue, key, value)
    log_activity(
        db,
        user=current_user,
        action="issue.update",
        entity_type="issue",
        entity_id=issue_id,
        details=data,
    )
    db.commit()
    db.refresh(issue)
    return issue

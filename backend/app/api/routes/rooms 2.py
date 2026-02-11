from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_roles
from app.models.room import Room
from app.models.user import User, UserRole
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate
from app.services.notifications import notify_admin_update

router = APIRouter()


@router.get("/", response_model=list[RoomOut])
def list_rooms(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[RoomOut]:
    return list(db.execute(select(Room)).scalars())


@router.post("/", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: RoomCreate,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> RoomOut:
    existing = db.execute(select(Room).where(Room.name == payload.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Room name already exists")
    room = Room(**payload.model_dump())
    db.add(room)
    notify_admin_update(
        db,
        title="Room Added",
        message=f"{current_user.name} added room {payload.name} ({payload.type.value}).",
        actor_user_id=current_user.id,
    )
    db.commit()
    db.refresh(room)
    return room


@router.put("/{room_id}", response_model=RoomOut)
def update_room(
    room_id: str,
    payload: RoomUpdate,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> RoomOut:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        existing = db.execute(select(Room).where(Room.name == data["name"], Room.id != room_id)).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Room name already exists")

    for key, value in data.items():
        setattr(room, key, value)
    if data:
        notify_admin_update(
            db,
            title="Room Updated",
            message=f"{current_user.name} updated room {room.name}.",
            actor_user_id=current_user.id,
        )
    db.commit()
    db.refresh(room)
    return room


@router.delete("/{room_id}")
def delete_room(
    room_id: str,
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.scheduler)),
    db: Session = Depends(get_db),
) -> dict:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    notify_admin_update(
        db,
        title="Room Deleted",
        message=f"{current_user.name} deleted room {room.name}.",
        actor_user_id=current_user.id,
    )
    db.delete(room)
    db.commit()
    return {"success": True}

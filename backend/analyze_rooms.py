import os
import sys
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

# Add backend to path
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.app.models.room import Room, RoomType
from backend.app.core.config import settings

def analyze_rooms():
    # Use the DATABASE_URL from environment or config
    # Since I'm running this as a script, I'll try to get it from settings
    engine = create_engine("postgresql+psycopg://tejeshwarcdr@localhost:5432/shedforge")
    with Session(engine) as session:
        rooms = session.execute(select(Room)).scalars().all()
        print(f"Total Rooms: {len(rooms)}")
        counts = {}
        for r in rooms:
            counts[r.type] = counts.get(r.type, 0) + 1
            print(f"Room: {r.name}, Type: {r.type}, Capacity: {r.capacity}")
        print(f"Counts: {counts}")

if __name__ == "__main__":
    analyze_rooms()

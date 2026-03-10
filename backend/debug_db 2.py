import os
import sys

# Setup paths
backend_path = os.path.dirname(os.path.abspath(__file__))
sys.path.append(backend_path)

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.models.room import Room, RoomType
from app.core.config import settings

def debug():
    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    try:
        with Session(engine) as session:
            rooms = session.execute(select(Room)).scalars().all()
            print(f"\n--- ROOMS ({len(rooms)}) ---")
            for r in rooms:
                print(f"ID: {r.id}, Name: {r.name}, Type: {r.type}, Cap: {r.capacity}")
            
            # Check if there are any other lecture rooms
            lecture_rooms = [r for r in rooms if r.type in {RoomType.lecture, RoomType.seminar}]
            print(f"\nLecture Rooms Found: {len(lecture_rooms)}")
            
            if not lecture_rooms:
                print("WARNING: NO LECTURE/SEMINAR ROOMS FOUND! EVERYTHING WILL FALL BACK TO ALL ROOMS OR A102.")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()

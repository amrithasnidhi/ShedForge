from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.faculty import Faculty
from app.models.room import Room
from app.models.course import Course
from app.models.timetable import OfficialTimetable

db = SessionLocal()
try:
    print(f"Users: {db.query(User).count()}")
    print(f"  - Admin: {db.query(User).filter(User.role == UserRole.admin).count()}")
    print(f"  - Scheduler: {db.query(User).filter(User.role == UserRole.scheduler).count()}")
    print(f"  - Faculty: {db.query(User).filter(User.role == UserRole.faculty).count()}")
    print(f"  - Student: {db.query(User).filter(User.role == UserRole.student).count()}")
    
    print(f"Faculty Records: {db.query(Faculty).count()}")
    print(f"Rooms: {db.query(Room).count()}")
    print(f"Courses: {db.query(Course).count()}")
    
    official = db.query(OfficialTimetable).first()
    if official:
        slots = official.payload.get("timetableData", [])
        print(f"Official Slots: {len(slots)}")
        if slots:
            print(f"Sample Slot: {slots[0]}")
    
    # Check if any faculty user email matches a faculty record email
    faculty_users = db.query(User).filter(User.role == UserRole.faculty).all()
    faculty_records = db.query(Faculty).all()
    record_emails = {f.email.lower() for f in faculty_records}
    matches = [u.email for u in faculty_users if u.email.lower() in record_emails]
    print(f"Faculty User Matches: {len(matches)} / {len(faculty_users)}")
    if faculty_users and not matches:
        print(f"Sample Faculty User Email: {faculty_users[0].email}")
        if faculty_records:
            print(f"Sample Faculty Record Email: {faculty_records[0].email}")

finally:
    db.close()

from app.db.session import SessionLocal
from app.models.timetable import OfficialTimetable
from app.models.timetable_version import TimetableVersion

db = SessionLocal()
try:
    official = db.query(OfficialTimetable).first()
    print(f"Official Timetable: {official.id if official else 'None'}")
    if official:
        print(f"Updated At: {official.updated_at}")
        # print(f"Payload Keys: {official.payload.keys() if official.payload else 'None'}")
    
    versions = db.query(TimetableVersion).order_by(TimetableVersion.created_at.desc()).limit(5).all()
    print(f"Recent Versions: {len(versions)}")
    for v in versions:
        print(f"  - {v.label} (Created: {v.created_at})")
finally:
    db.close()

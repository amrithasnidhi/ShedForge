from app.db.session import SessionLocal
from app.models.timetable_version import TimetableVersion
import json

db = SessionLocal()
try:
    version = db.query(TimetableVersion).order_by(TimetableVersion.created_at.desc()).first()
    if version:
        print(f"Version: {version.label}")
        print(f"Summary: {json.dumps(version.summary, indent=2)}")
        # print(f"Payload Slots: {len(version.payload.get('timetableData', []))}")
    else:
        print("No versions found.")
finally:
    db.close()

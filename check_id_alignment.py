from app.db.session import SessionLocal
from app.models.faculty import Faculty
from app.models.timetable import OfficialTimetable

db = SessionLocal()
try:
    official = db.query(OfficialTimetable).first()
    if official:
        payload = official.payload
        faculty_data = payload.get("facultyData", [])
        if faculty_data:
            print(f"Payload Faculty[0] ID: {faculty_data[0].get('id')}")
            print(f"Payload Faculty[0] Email: {faculty_data[0].get('email')}")
            
            db_faculty = db.query(Faculty).filter(Faculty.email.ilike(faculty_data[0].get('email'))).first()
            if db_faculty:
                print(f"DB Faculty ID: {db_faculty.id}")
                if db_faculty.id != faculty_data[0].get('id'):
                    print("!!! ID MISMATCH DETECTED !!!")
            else:
                print("No DB Faculty found for this email.")
        else:
            print("No faculty data in payload.")
            
        timetable_data = payload.get("timetableData", [])
        if timetable_data:
            print(f"Sample Timetable Slot FacultyId: {timetable_data[0].get('facultyId')}")
    else:
        print("No official timetable.")
finally:
    db.close()

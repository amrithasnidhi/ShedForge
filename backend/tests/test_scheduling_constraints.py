def register_user(client, payload):
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    return response.json()


def login_user(client, email, password, role):
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password, "role": role},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_lab_batch_and_room_capacity_constraints(client):
    admin_payload = {
        "name": "Admin User",
        "email": "admin@example.com",
        "password": "password123",
        "role": "admin",
        "department": "Administration",
    }
    register_user(client, admin_payload)
    admin_token = login_user(client, admin_payload["email"], admin_payload["password"], "admin")

    payload = {
        "termNumber": 1,
        "facultyData": [
            {
                "id": "f-1",
                "name": "Prof Lab",
                "department": "CS",
                "workloadHours": 0,
                "maxHours": 10,
                "availability": [],
                "email": "lab@example.com",
            }
        ],
        "courseData": [
            {
                "id": "lab-1",
                "code": "CSL100",
                "name": "Systems Lab",
                "type": "lab",
                "credits": 2,
                "facultyId": "f-1",
                "duration": 2,
                "hoursPerWeek": 2,
            }
        ],
        "roomData": [
            {
                "id": "r-1",
                "name": "Lab-1",
                "capacity": 20,
                "type": "lab",
                "building": "Block A",
            }
        ],
        "timetableData": [
            {
                "id": "ts-1",
                "day": "Monday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": "lab-1",
                "roomId": "r-1",
                "facultyId": "f-1",
                "section": "A",
                "studentCount": 18,
            },
            {
                "id": "ts-2",
                "day": "Monday",
                "startTime": "09:40",
                "endTime": "10:30",
                "courseId": "lab-1",
                "roomId": "r-1",
                "facultyId": "f-1",
                "section": "A",
                "studentCount": 18,
            },
        ],
    }

    response = client.put(
        "/api/timetable/official",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400

    payload["timetableData"][0]["batch"] = "A1"
    payload["timetableData"][1]["batch"] = "A1"
    payload["roomData"][0]["type"] = "lecture"

    response = client.put(
        "/api/timetable/official",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400

    payload["roomData"][0]["type"] = "lab"
    payload["timetableData"][0]["studentCount"] = 25
    payload["timetableData"][1]["studentCount"] = 25

    response = client.put(
        "/api/timetable/official",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400


def test_parallel_lab_batches_allowed(client):
    admin_payload = {
        "name": "Admin User",
        "email": "admin2@example.com",
        "password": "password123",
        "role": "admin",
        "department": "Administration",
    }
    register_user(client, admin_payload)
    admin_token = login_user(client, admin_payload["email"], admin_payload["password"], "admin")

    payload = {
        "termNumber": 1,
        "facultyData": [
            {
                "id": "f-1",
                "name": "Prof Lab",
                "department": "CS",
                "workloadHours": 0,
                "maxHours": 10,
                "availability": [],
                "email": "lab2@example.com",
            },
            {
                "id": "f-2",
                "name": "Prof Lab 2",
                "department": "CS",
                "workloadHours": 0,
                "maxHours": 10,
                "availability": [],
                "email": "lab3@example.com",
            },
        ],
        "courseData": [
            {
                "id": "lab-1",
                "code": "CSL101",
                "name": "Networks Lab",
                "type": "lab",
                "credits": 2,
                "facultyId": "f-1",
                "duration": 1,
                "hoursPerWeek": 2,
            }
        ],
        "roomData": [
            {
                "id": "r-1",
                "name": "Lab-A",
                "capacity": 20,
                "type": "lab",
                "building": "Block A",
            },
            {
                "id": "r-2",
                "name": "Lab-B",
                "capacity": 20,
                "type": "lab",
                "building": "Block A",
            },
        ],
        "timetableData": [
            {
                "id": "ts-1",
                "day": "Tuesday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": "lab-1",
                "roomId": "r-1",
                "facultyId": "f-1",
                "section": "A",
                "batch": "A1",
                "studentCount": 18,
            },
            {
                "id": "ts-2",
                "day": "Tuesday",
                "startTime": "09:40",
                "endTime": "10:30",
                "courseId": "lab-1",
                "roomId": "r-1",
                "facultyId": "f-1",
                "section": "A",
                "batch": "A1",
                "studentCount": 18,
            },
            {
                "id": "ts-3",
                "day": "Tuesday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": "lab-1",
                "roomId": "r-2",
                "facultyId": "f-2",
                "section": "A",
                "batch": "A2",
                "studentCount": 18,
            },
            {
                "id": "ts-4",
                "day": "Tuesday",
                "startTime": "09:40",
                "endTime": "10:30",
                "courseId": "lab-1",
                "roomId": "r-2",
                "facultyId": "f-2",
                "section": "A",
                "batch": "A2",
                "studentCount": 18,
            },
        ],
    }

    response = client.put(
        "/api/timetable/official",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200


def test_program_credit_requirements(client):
    admin_payload = {
        "name": "Admin User",
        "email": "admin3@example.com",
        "password": "password123",
        "role": "admin",
        "department": "Administration",
    }
    register_user(client, admin_payload)
    admin_token = login_user(client, admin_payload["email"], admin_payload["password"], "admin")

    program_response = client.post(
        "/api/programs",
        json={
            "name": "B.Tech CSE",
            "code": "CSE",
            "department": "CS",
            "degree": "BS",
            "duration_years": 4,
            "sections": 1,
            "total_students": 60,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert program_response.status_code == 201
    program_id = program_response.json()["id"]

    term_response = client.post(
        f"/api/programs/{program_id}/terms",
        json={"term_number": 1, "name": "Semester 1", "credits_required": 2},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert term_response.status_code == 201

    course_one = client.post(
        "/api/courses",
        json={
            "code": "CS101",
            "name": "Intro to CS",
            "type": "theory",
            "credits": 1,
            "duration_hours": 1,
            "sections": 1,
            "hours_per_week": 1,
            "faculty_id": None,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert course_one.status_code == 201
    course_one_id = course_one.json()["id"]

    course_two = client.post(
        "/api/courses",
        json={
            "code": "MA101",
            "name": "Maths",
            "type": "theory",
            "credits": 1,
            "duration_hours": 1,
            "sections": 1,
            "hours_per_week": 1,
            "faculty_id": None,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert course_two.status_code == 201
    course_two_id = course_two.json()["id"]

    response = client.post(
        f"/api/programs/{program_id}/courses",
        json={"term_number": 1, "course_id": course_one_id, "is_required": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201

    response = client.post(
        f"/api/programs/{program_id}/courses",
        json={"term_number": 1, "course_id": course_two_id, "is_required": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201

    base_payload = {
        "programId": program_id,
        "termNumber": 1,
        "facultyData": [
            {
                "id": "f-1",
                "name": "Prof A",
                "department": "CS",
                "workloadHours": 0,
                "maxHours": 10,
                "availability": [],
                "email": "prof@example.com",
            }
        ],
        "roomData": [
            {"id": "r-1", "name": "LH-1", "capacity": 60, "type": "lecture", "building": "Main"},
            {"id": "r-2", "name": "LH-2", "capacity": 60, "type": "lecture", "building": "Main"},
        ],
    }

    payload_missing = {
        **base_payload,
        "courseData": [
            {
                "id": course_one_id,
                "code": "CS101",
                "name": "Intro to CS",
                "type": "theory",
                "credits": 1,
                "facultyId": "f-1",
                "duration": 1,
                "hoursPerWeek": 1,
            }
        ],
        "timetableData": [
            {
                "id": "ts-1",
                "day": "Monday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": course_one_id,
                "roomId": "r-1",
                "facultyId": "f-1",
                "section": "A",
                "studentCount": 50,
            }
        ],
    }

    response = client.put(
        "/api/timetable/official",
        json=payload_missing,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400

    payload_ok = {
        **base_payload,
        "courseData": [
            {
                "id": course_one_id,
                "code": "CS101",
                "name": "Intro to CS",
                "type": "theory",
                "credits": 1,
                "facultyId": "f-1",
                "duration": 1,
                "hoursPerWeek": 1,
            },
            {
                "id": course_two_id,
                "code": "MA101",
                "name": "Maths",
                "type": "theory",
                "credits": 1,
                "facultyId": "f-1",
                "duration": 1,
                "hoursPerWeek": 1,
            },
        ],
        "timetableData": [
            {
                "id": "ts-1",
                "day": "Monday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": course_one_id,
                "roomId": "r-1",
                "facultyId": "f-1",
                "section": "A",
                "studentCount": 50,
            },
            {
                "id": "ts-2",
                "day": "Monday",
                "startTime": "09:40",
                "endTime": "10:30",
                "courseId": course_two_id,
                "roomId": "r-2",
                "facultyId": "f-1",
                "section": "A",
                "studentCount": 50,
            },
        ],
    }

    response = client.put(
        "/api/timetable/official",
        json=payload_ok,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200


def test_publish_rejects_multiple_faculty_for_same_theory_course_within_section(client):
    admin_payload = {
        "name": "Admin Faculty Consistency",
        "email": "admin-faculty-consistency@example.com",
        "password": "password123",
        "role": "admin",
        "department": "Administration",
    }
    register_user(client, admin_payload)
    admin_token = login_user(client, admin_payload["email"], admin_payload["password"], "admin")

    payload = {
        "termNumber": 2,
        "facultyData": [
            {
                "id": "f-1",
                "name": "Faculty One",
                "department": "CSE",
                "workloadHours": 0,
                "maxHours": 16,
                "availability": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                "email": "faculty.one@example.com",
            },
            {
                "id": "f-2",
                "name": "Faculty Two",
                "department": "CSE",
                "workloadHours": 0,
                "maxHours": 16,
                "availability": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                "email": "faculty.two@example.com",
            },
        ],
        "courseData": [
            {
                "id": "c-1",
                "code": "CSE311",
                "name": "Software Engineering",
                "type": "theory",
                "credits": 2,
                "facultyId": "f-1",
                "duration": 1,
                "hoursPerWeek": 2,
            }
        ],
        "roomData": [
            {"id": "r-1", "name": "A101", "capacity": 70, "type": "lecture", "building": "Main"},
            {"id": "r-2", "name": "A102", "capacity": 70, "type": "lecture", "building": "Main"},
        ],
        "timetableData": [
            {
                "id": "ts-a",
                "day": "Monday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": "c-1",
                "roomId": "r-1",
                "facultyId": "f-1",
                "section": "A",
                "studentCount": 60,
            },
            {
                "id": "ts-b",
                "day": "Tuesday",
                "startTime": "08:50",
                "endTime": "09:40",
                "courseId": "c-1",
                "roomId": "r-2",
                "facultyId": "f-2",
                "section": "A",
                "studentCount": 60,
            },
        ],
    }

    response = client.put(
        "/api/timetable/official",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400
    assert "one faculty within each section" in response.json()["detail"]

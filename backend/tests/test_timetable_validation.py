
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


def test_timetable_validation_rejects_bad_references(client):
    admin_payload = {
        "name": "Admin User",
        "email": "admin@example.com",
        "password": "password123",
        "role": "admin",
        "department": "Administration",
    }
    register_user(client, admin_payload)
    admin_token = login_user(client, admin_payload["email"], admin_payload["password"], "admin")

    bad_payload = {
        "facultyData": [],
        "courseData": [],
        "roomData": [],
        "timetableData": [
            {
                "id": "ts-1",
                "day": "Monday",
                "startTime": "09:00",
                "endTime": "10:00",
                "courseId": "missing-course",
                "roomId": "missing-room",
                "facultyId": "missing-faculty",
                "section": "A",
            }
        ],
    }

    response = client.put(
        "/api/timetable/official",
        json=bad_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422

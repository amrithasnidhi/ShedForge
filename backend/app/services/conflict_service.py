from collections import defaultdict
from typing import List, Dict, Set, Tuple
from app.schemas.timetable import OfficialTimetablePayload, TimeSlotPayload
from app.schemas.conflict import ConflictReport, ConflictDetail, ResolutionAction
from app.models.room import RoomType

class ConflictService:
    def __init__(self, payload: OfficialTimetablePayload, room_map: Dict[str, dict], faculty_map: Dict[str, dict]):
        self.payload = payload
        self.room_map = room_map
        self.faculty_map = faculty_map
        self.slots: List[TimeSlotPayload] = payload.timetable_data

    def detect_conflicts(self) -> ConflictReport:
        conflicts: List[ConflictDetail] = []
        
        # Helper to parse time
        def parse_time(t: str) -> int:
            h, m = map(int, t.split(':'))
            return h * 60 + m

        # O(N^2) check is acceptable for N < 500 (typical weekly slots)
        # But let's be smarter: Bucket by Day
        slots_by_day = defaultdict(list)
        for slot in self.slots:
            slots_by_day[slot.day].append(slot)

        for day, day_slots in slots_by_day.items():
            # Check pairwise in day
            n = len(day_slots)
            for i in range(n):
                s1 = day_slots[i]
                start1, end1 = parse_time(s1.startTime), parse_time(s1.endTime)
                
                # Check Room Capacity
                room = self.room_map.get(s1.roomId)
                if room:
                    capacity = room.get("capacity", 0)
                    student_count = s1.studentCount or 0
                    if capacity < student_count:
                        conflicts.append(ConflictDetail(
                            id=f"cap-{s1.id}",
                            conflict_type="room_capacity",
                            description=f"Room {room.get('name')} capacity ({capacity}) < Students ({student_count})",
                            severity="hard",
                            affected_slots=[s1.id]
                        ))
                    if s1.sessionType == "lab" and room.get("type") != "lab":
                         conflicts.append(ConflictDetail(
                            id=f"type-{s1.id}",
                            conflict_type="room_type",
                            description=f"Lab session in non-lab room {room.get('name')}",
                            severity="hard",
                            affected_slots=[s1.id]
                        ))

                for j in range(i + 1, n):
                    s2 = day_slots[j]
                    start2, end2 = parse_time(s2.startTime), parse_time(s2.endTime)
                    
                    # Overlap Check
                    if max(start1, start2) < min(end1, end2):
                        # Overlap! Check resources
                        if s1.roomId == s2.roomId:
                            room_name = self.room_map.get(s1.roomId, {}).get("name", s1.roomId)
                            conflicts.append(ConflictDetail(
                                id=f"room-{s1.id}-{s2.id}",
                                conflict_type="room_conflict",
                                description=f"Room overlap in {room_name}: {s1.courseId} and {s2.courseId}",
                                severity="hard",
                                affected_slots=[s1.id, s2.id]
                            ))
                        if s1.facultyId == s2.facultyId:
                            faculty_name = self.faculty_map.get(s1.facultyId, {}).get("name", s1.facultyId)
                            conflicts.append(ConflictDetail(
                                id=f"fac-{s1.id}-{s2.id}",
                                conflict_type="faculty_conflict",
                                description=f"Faculty overlap for {faculty_name}: {s1.courseId} and {s2.courseId}",
                                severity="hard",
                                affected_slots=[s1.id, s2.id]
                            ))
                        if s1.section == s2.section:
                            # Allow parallel batches if they are different batches
                            if s1.batch and s2.batch and s1.batch != s2.batch:
                                continue
                            conflicts.append(ConflictDetail(
                                id=f"sec-{s1.id}-{s2.id}",
                                conflict_type="section_conflict",
                                description=f"Section overlap: {s1.courseId} and {s2.courseId}",
                                severity="hard",
                                affected_slots=[s1.id, s2.id]
                            ))

        return ConflictReport(conflicts=conflicts, suggested_resolutions=[])

    def generate_resolutions(self, conflict: ConflictDetail) -> List[ResolutionAction]:
        resolutions = []
        if conflict.conflict_type == "room_capacity" or conflict.conflict_type == "room_conflict":
             # Suggest finding another room
             resolutions.append(ResolutionAction(
                 action_type="change_room",
                 description="Find a larger or free room",
                 target_slot_id=conflict.affected_slots[0],
                 parameters={} # Frontend to pop choice
             ))
        
        if conflict.conflict_type in ("faculty_conflict", "section_conflict"):
             resolutions.append(ResolutionAction(
                 action_type="move_slot",
                 description="Move to a different time slot",
                 target_slot_id=conflict.affected_slots[0],
                 parameters={}
             ))
             
        return resolutions

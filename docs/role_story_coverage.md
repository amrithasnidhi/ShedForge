# Role Story Coverage (Role-Based Catalog)

Status legend:
- `Implemented`: end-to-end backend + frontend path available.
- `Implemented (Baseline)`: implemented with practical baseline behavior.
- `Partial`: available but needs deeper enhancement for full institutional sophistication.

## Epic 1
| Story | Status | Evidence |
|---|---|---|
| 1.1 Define Academic Entities | Implemented | `/api/faculty`, `/api/courses`, `/api/rooms`; pages: `/faculty`, `/courses`, `/rooms` |
| 1.2 Enforce Institutional Working Hours | Implemented | `/api/settings/working-hours`; timetable validation in `/api/timetable/official`; UI `/settings` |
| 1.3 Differentiate Theory vs Lab Scheduling | Implemented | course `type`, lab block validation, lab-room enforcement in timetable/generator routes |
| 1.4 Enforce Room Capacity Constraints | Implemented | `enforce_room_capacity` in timetable route; generation penalty + checks |
| 1.5 Parallel Section Scheduling | Implemented | overlap checks allow valid non-conflicting parallel sessions; generator occupancy constraints |
| 1.6 Generate Multiple Timetable Alternatives | Implemented | `/api/timetable/generate` returns ranked `alternatives`; UI `/generator` tabs |
| 1.7 Auto-Adapt When a New Section Is Added | Implemented (Baseline) | sections in `/api/programs/{id}/sections` feed generation request building |
| 1.8 Automatic Timetable Conflict Detection | Implemented | `/api/timetable/conflicts`; UI `/conflicts` |
| 1.9 Configurable Timetable Rules | Implemented | working hours + schedule policy + semester constraints + generator settings |
| 1.10 Lock Finalized Slots | Implemented | `/api/timetable/locks` CRUD + UI in `/generator` |

## Epic 2
| Story | Status | Evidence |
|---|---|---|
| 2.1 Specify Faculty Availability | Implemented | faculty availability fields + `/availability` + generation/validation checks |
| 2.2 Block Unavailable Days | Implemented | day-level availability filtering in generator and conflict checks |
| 2.3 Manage Faculty Leave | Implemented | `/api/leaves` + faculty `/leaves` + admin `/leave-management` |
| 2.4 Substitute Faculty Suggestions | Implemented | `/api/faculty/substitutes/suggestions` + `/leave-management` suggestions |
| 2.5 Balanced Daily Teaching Loads | Implemented (Baseline) | fairness/spread objectives and analytics daily load heatmap |
| 2.6 Consider Faculty Preferences | Implemented | preference fields + validation in timetable publish + availability UI |
| 2.7 Prevent Back-to-Back Overloads | Implemented | `avoid_back_to_back` and min-break checks |
| 2.8 Visibility Into Assigned Workload | Implemented | analytics workload charts + faculty dashboard schedule stats |
| 2.9 Enforce Workload Limits | Implemented | faculty `max_hours` checks/penalties in validation and generator |
| 2.10 Resolve Faculty Conflicts Automatically | Implemented | hard penalties for faculty overlaps in evolutionary evaluation |

## Epic 3
| Story | Status | Evidence |
|---|---|---|
| 3.1 Model Academic Programs | Implemented | `/api/programs` + `/api/programs/{id}/terms|sections|courses`; UI `/programs` |
| 3.2 Handle Elective Overlaps | Implemented | elective overlap groups with DB model + `/api/programs/{id}/elective-groups`; overlap enforcement in publish/conflict/generator |
| 3.3 Support Section Groupings (Shared Lectures) | Implemented | shared lecture group model + `/api/programs/{id}/shared-lecture-groups`; synchronized shared-session validation in publish and generator |
| 3.4 Enforce Credit-Hour Requirements | Implemented | `enforce_program_credit_requirements` in timetable validation |
| 3.5 Semester-Wise Constraints | Implemented | `/api/constraints/semesters` + enforced in publish and generator |
| 3.6 Support Lab Batches | Implemented | `lab_batch_count`, batch slots, parallel lab-batch allowances |
| 3.7 Program-Specific Rules | Partial | term/section/course constraints exist; richer per-program custom rule engine pending |
| 3.8 Enforce Prerequisite Constraints | Implemented | program-course prerequisite mapping + validation in program structure, publish, and generator flows |
| 3.9 Schedule Cross-Program Electives Efficiently | Partial | baseline scheduling supports electives; no dedicated cross-program optimizer yet |
| 3.10 Curriculum Changes Trigger Re-evaluation | Implemented | mutation routes create `timetable_reevaluation_events`; `/api/timetable/reevaluation/events|run` enables selective re-generation + event resolution with versioned publish |

## Epic 4
| Story | Status | Evidence |
|---|---|---|
| 4.1 Adaptive AI Timetable Optimization | Implemented | `EvolutionaryScheduler` with tunable settings and restart strategy |
| 4.2 Faculty Workload Fairness Optimization | Implemented | fairness penalties + workload analytics |
| 4.3 Student-Centric Schedule Quality Optimization | Partial | spread/load signals included; no full student-gap objective profile yet |
| 4.4 Multi-Objective Trade-off Exploration | Implemented | tunable objective weights via generation settings UI/API |
| 4.5 Scenario-Based Optimization Simulation | Implemented (Baseline) | run generator with settings overrides and compare alternatives |
| 4.6 Personalized Faculty Optimization Preferences | Implemented | per-faculty preference fields integrated into publication checks |
| 4.8 Learning from Past Schedules | Partial | version history exists; optimizer does not yet train from history |
| 4.9 Automatic Best Schedule Selection | Implemented | rank-1 solution + optional `persist_official` auto publish |

## Epic 5
| Story | Status | Evidence |
|---|---|---|
| 5.1 Publish Timetables to Users | Implemented | `/api/timetable/official` publish + all role dashboards consume official payload |
| 5.2 Student Timetable Access | Implemented | `/my-timetable`, `/student-dashboard` |
| 5.3 Faculty Timetable Access | Implemented | `/my-schedule`, `/faculty-dashboard` |
| 5.4 Schedule Change Notifications | Implemented | notification creation on publish/issue/system events + `/notifications` |
| 5.5 Timetable Download Option | Implemented | PDF/PNG/ICS/CSV exports on schedule/faculty/student timetable pages |
| 5.6 Room-wise Schedule View | Implemented | room filter mode on `/schedule` |
| 5.7 Simple Schedule Search | Implemented | search in student/faculty timetable pages and data pages |
| 5.8 Academic Calendar Integration | Implemented | ICS generation in timetable pages |
| 5.9 Timetable Version Labeling | Implemented | version labels + optional label on publish + `/versions` |
| 5.10 Feedback on Timetable Issues | Implemented (Baseline) | `/issues` reporting/status; attachment support pending |

## Epic 6
| Story | Status | Evidence |
|---|---|---|
| 6.1 Visual Timetables | Implemented | grid-based timetable UIs across roles |
| 6.2 Workload Analytics | Implemented | `/api/timetable/analytics` + `/analytics` |
| 6.3 Comparison Views | Implemented | `/api/timetable/versions/compare` + `/versions` |
| 6.4 Constraint Impact Visualization | Implemented (Baseline) | analytics/conflicts views tied to constraint outcomes |
| 6.5 Exportable Reports | Implemented (Baseline) | PDF/PNG/ICS/CSV exports + analytics screens |
| 6.7 Heatmaps | Implemented | daily workload heatmap in `/analytics` |
| 6.8 Trend Analysis | Implemented | `/api/timetable/trends` + trend view in analytics/versions |
| 6.9 Explainable Scheduling Decisions | Implemented (Baseline) | conflict descriptions/resolution guidance + constraint status explanations |
| 6.10 Interactive Filtering | Implemented | role-based filters for view mode/program/section/faculty/room/search |

## Epic 7
| Story | Status | Evidence |
|---|---|---|
| 7.1 User Login and Logout | Implemented | `/api/auth/login`, `/api/auth/logout`, frontend auth provider |
| 7.2 Role-Based Feature Access | Implemented | API role guards + frontend `AuthGuard` + role navigation |
| 7.3 Password Change and Reset | Implemented | `/api/auth/password/forgot|reset|change` + login page flows |
| 7.4 Protected Timetable Editing | Implemented | publish endpoints restricted to admin/scheduler |
| 7.5 User Activity Tracking | Implemented | `activity_logs` table, `/api/activity/logs`, help page activity panel |
| 7.6 Input Safety Checks | Implemented | Pydantic validation + route validation + safe auth handling |
| 7.7 Session Timeout | Implemented | JWT expiry + frontend inactivity timeout auto logout |
| 7.8 System Availability Status | Implemented | `/api/health` + dashboard status + `/api/system/info` |
| 7.9 Data Backup Trigger | Implemented | `/api/system/backup` + help page trigger |
| 7.10 Simple Help & System Info Page | Implemented | `/help` page with system metadata and support sections |

## Current Priority Gaps (for full parity)
1. Richer cross-program elective optimization (`3.9`).
2. History-driven optimizer learning loop (`4.8`) and richer student-centric objective pack (`4.3`).
3. Issue attachments and richer explainability/report artifacts (`5.10`, `6.5`, `6.9`).

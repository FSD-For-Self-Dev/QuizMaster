from typing import Dict, Set
import json
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.room import get_room_with_participants, add_participant, remove_participant
from app.schemas.room import RoomWithParticipants

# Store active WebSocket connections
# room_id -> set of WebSocket connections
active_connections: Dict[str, Set[WebSocket]] = {}

# Store cooperative quiz state (classic)
cooperative_quiz_state: Dict[str, dict] = {}

# Store cooperative jeopardy state (NEW: separate)
cooperative_jeopardy_state: Dict[str, dict] = {}

router = APIRouter()


async def get_websocket_db():
    """Dependency to get database session for WebSocket connections."""
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def connect_to_room(websocket: WebSocket, room_id: str):
    """Connect a WebSocket to a room."""
    await websocket.accept()

    if room_id not in active_connections:
        active_connections[room_id] = set()

    active_connections[room_id].add(websocket)

    try:
        await send_room_update(room_id, "user_connected", {"message": "Connected to room"})
    except Exception as e:
        print(f"Error sending initial update: {e}")


async def disconnect_from_room(websocket: WebSocket, room_id: str):
    """Disconnect a WebSocket from a room."""
    if room_id in active_connections:
        active_connections[room_id].discard(websocket)
        if not active_connections[room_id]:
            del active_connections[room_id]


async def broadcast_to_room(room_id: str, message: dict):
    """Broadcast a message to all connected clients in a room."""
    if room_id not in active_connections:
        return

    disconnected_connections = set()
    text_message = json.dumps(jsonable_encoder(message))

    for connection in active_connections[room_id]:
        try:
            await connection.send_text(text_message)
        except Exception as e:
            print(f"Error sending message to connection: {e}")
            disconnected_connections.add(connection)

    for connection in disconnected_connections:
        active_connections[room_id].discard(connection)


async def send_room_update(room_id: str, event_type: str, data: dict):
    """Send a room update to all participants."""
    message = {"type": event_type, "data": data, "timestamp": datetime.utcnow().isoformat()}
    await broadcast_to_room(room_id, message)


async def send_to_sender(websocket: WebSocket, message: dict):
    """Send a message back to the sender WebSocket."""
    try:
        await websocket.send_text(json.dumps(jsonable_encoder(message)))
    except Exception as e:
        print(f"Error sending message to sender: {e}")


@router.websocket("/rooms/{room_id}/ws")
async def room_websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    db: Session = Depends(get_websocket_db)
):
    """WebSocket endpoint for real-time room updates."""
    await connect_to_room(websocket, room_id)

    # Send initial room state
    try:
        room_state = get_room_with_participants(db, room_id)
        if room_state:
            if isinstance(room_state, RoomWithParticipants):
                room_schema = room_state
            else:
                room_schema = RoomWithParticipants.model_validate(room_state)

            payload = {
                "type": "room_state",
                "data": room_schema.model_dump(),
                "timestamp": datetime.utcnow(),
            }
            await websocket.send_text(json.dumps(jsonable_encoder(payload)))
    except Exception as e:
        print(f"Error sending initial room state: {e}")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")
            data = msg.get("data", {})

            # Cooperative classic quiz messages forwarded to all
            if msg_type in {
                "cooperative_quiz_start",
                "cooperative_new_question",
                "cooperative_answer_submitted",
                "cooperative_answer_status",
                "cooperative_question_results",
                "cooperative_quiz_end",
                "cooperative_answer_status_request",
                "cooperative_next_question",
            }:
                await send_room_update(room_id, msg_type, data)
                continue

            # Cooperative Jeopardy messages forwarded to all (NEW)
            if msg_type in {
                "cooperative_jeopardy_start",
                "cooperative_jeopardy_chooser_selected",
                "cooperative_jeopardy_category_selected",
                "cooperative_jeopardy_question_started",
                "cooperative_jeopardy_answer_submitted",
                "cooperative_jeopardy_question_results",
                "cooperative_jeopardy_quiz_end",
            }:
                await send_room_update(room_id, msg_type, data)
                continue

            # Quiz round orchestration messages forwarded to all
            if msg_type in {
                "quiz_round_intro",
                "quiz_round_results",
                "quiz_round_next",
            }:
                await send_room_update(room_id, msg_type, data)
                continue

            # Optional: ignore pings
            if msg_type in {"ping"}:
                await send_to_sender(websocket, {"type": "pong", "data": {}, "timestamp": datetime.utcnow().isoformat()})
                continue

            # Unknown message types: ignore or log
            print(f"Unknown WS message type: {msg_type} in room {room_id}")

    except WebSocketDisconnect:
        await disconnect_from_room(websocket, room_id)
    except Exception as e:
        print(f"WebSocket error in room {room_id}: {e}")
        await disconnect_from_room(websocket, room_id)


# Cooperative Quiz Handler Functions (unchanged)
async def handle_cooperative_quiz_start(room_id: str, data: dict, db: Session):
    print(f"Starting cooperative quiz in room {room_id}")

    cooperative_quiz_state[room_id] = {
        "quiz_started": True,
        "current_question_index": 0,
        "participant_answers": {},
        "quiz_data": data.get("quiz_data", {}),
        "question_start_time": datetime.utcnow().isoformat()
    }

    try:
        from app.services.room import update_room_status
        update_room_status(db, room_id, "started")
    except Exception as e:
        print(f"Error updating room status: {e}")

    await send_room_update(room_id, "cooperative_quiz_start", data)


async def handle_cooperative_answer_submit(room_id: str, data: dict, db: Session):
    participant_id = data.get("participant_id")
    question_id = data.get("question_id")
    answer_id = data.get("answer_id")

    print(f"Answer submitted: participant {participant_id}, question {question_id}")

    room_state = get_room_with_participants(db, room_id)
    participant = None
    if room_state:
        participants = room_state.participants if hasattr(room_state, 'participants') else []
        participant = next((p for p in participants if p.id == participant_id), None)

    if not participant:
        print(f"Participant {participant_id} not found in room {room_id}")
        return

    is_correct = False

    if room_id in cooperative_quiz_state:
        cooperative_quiz_state[room_id]["participant_answers"][participant_id] = {
            "participant_id": participant_id,
            "participant_name": participant.guest_name,
            "question_id": question_id,
            "answer_id": answer_id,
            "is_correct": is_correct,
            "submitted_at": datetime.utcnow().isoformat()
        }

    await send_room_update(
        room_id,
        "cooperative_answer_submitted",
        {
            "participant_id": participant_id,
            "participant_name": participant.guest_name,
            "answer_id": answer_id,
            "is_correct": is_correct,
            "question_id": question_id
        }
    )


async def handle_cooperative_answer_status_request(websocket: WebSocket, room_id: str, data: dict, db: Session):
    question_id = data.get("question_id")

    if room_id not in cooperative_quiz_state:
        return

    quiz_state = cooperative_quiz_state[room_id]
    participant_answers = quiz_state.get("participant_answers", {})

    room_state = get_room_with_participants(db, room_id)
    active_participants = []
    if room_state:
        participants = room_state.participants if hasattr(room_state, 'participants') else []
        active_participants = [p for p in participants if p.is_active and not p.is_spectator]

    waiting_participants = []
    for participant in active_participants:
        if participant.id not in participant_answers:
            waiting_participants.append(participant.id)

    await send_to_sender(websocket, {
        "type": "cooperative_answer_status",
        "data": {
            "question_id": question_id,
            "waiting_participants": waiting_participants,
            "answered_count": len(active_participants) - len(waiting_participants),
            "total_participants": len(active_participants)
        },
        "timestamp": datetime.utcnow().isoformat()
    })


async def handle_cooperative_next_question(room_id: str, data: dict, db: Session):
    question_index = data.get("question_index", 0)

    print(f"Moving to question {question_index} in room {room_id}")

    if room_id in cooperative_quiz_state:
        cooperative_quiz_state[room_id]["current_question_index"] = question_index
        cooperative_quiz_state[room_id]["question_start_time"] = datetime.utcnow().isoformat()
        cooperative_quiz_state[room_id]["participant_answers"] = {}

    await send_room_update(
        room_id,
        "cooperative_new_question",
        {
            "question_index": question_index,
            "question_start_time": datetime.utcnow().isoformat()
        }
    )


async def handle_cooperative_question_results(room_id: str, data: dict, db: Session):
    print(f"Question results for room {room_id}: {data}")
    await send_room_update(room_id, "cooperative_question_results", data)


async def handle_cooperative_quiz_end(room_id: str, data: dict, db: Session):
    print(f"Quiz ended for room {room_id}: {data}")

    try:
        from app.services.room import update_room_status
        update_room_status(db, room_id, "finished")
    except Exception as e:
        print(f"Error updating room status: {e}")

    if room_id in cooperative_quiz_state:
        del cooperative_quiz_state[room_id]

    await send_room_update(room_id, "cooperative_quiz_end", data)


@router.get("/rooms/{room_id}/connections")
async def get_room_connection_count(room_id: str):
    count = len(active_connections.get(room_id, set()))
    return {"room_id": room_id, "active_connections": count}
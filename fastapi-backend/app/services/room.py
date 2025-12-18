from typing import List, Optional
import random
import string
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.room import Room
from app.models.room_participant import RoomParticipant
from app.schemas.room import (
    RoomCreate,
    RoomUpdate,
    RoomWithParticipants,
    RoomParticipantCreate,
    RoomParticipantResponse,
)


def generate_room_code() -> str:
    """Generate an 8-character room code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


def generate_pin_code() -> str:
    """Generate a 4-digit PIN code."""
    return f"{random.randint(1000, 9999)}"


def create_room(db: Session, room_data: RoomCreate, host_user_id: str) -> Room:
    """Create a new room (single quiz OR quiz round)."""

    if bool(room_data.quiz_id) == bool(room_data.quiz_round_id):
        raise ValueError("Provide exactly one of quiz_id or quiz_round_id")

    room_code = generate_room_code()
    pin_code = generate_pin_code()

    while db.query(Room).filter(Room.room_code == room_code).first():
        room_code = generate_room_code()

    db_room = Room(
        id=f"room_{datetime.now().timestamp()}_{room_code}",
        room_code=room_code,
        pin_code=pin_code,
        host_user_id=host_user_id,
        status="waiting",
        max_players=room_data.max_players,

        # IMPORTANT: SQLite table currently has no default, so set it here
        created_at=datetime.utcnow(),
    )

    if room_data.quiz_id:
        db_room.quiz_id = room_data.quiz_id
        db_room.quiz_round_id = None
    else:
        db_room.quiz_id = None
        db_room.quiz_round_id = room_data.quiz_round_id

    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    return db_room


def get_room_by_code(db: Session, room_code: str) -> Optional[Room]:
    """Get a room by room code."""
    return db.query(Room).filter(Room.room_code == room_code).first()


def get_room(db: Session, room_id: str) -> Optional[Room]:
    """Get a room by ID."""
    return db.query(Room).filter(Room.id == room_id).first()


def get_room_with_participants(db: Session, room_id: str) -> Optional[RoomWithParticipants]:
    """Get a room with all its participants."""
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return None

    participants = (
        db.query(RoomParticipant)
        .filter(
            and_(
                RoomParticipant.room_id == room_id,
                RoomParticipant.is_active == True,
            )
        )
        .all()
    )

    # Quiz info (single quiz rooms)
    quiz_title = room.quiz.title if room.quiz else None
    quiz_description = room.quiz.description if room.quiz else None
    quiz_type = room.quiz.type if room.quiz else None
    quiz_questions_count = len(room.quiz.questions) if (room.quiz and room.quiz.questions) else None

    # Quiz round info (round rooms)
    quiz_round_title = room.quiz_round.title if room.quiz_round else None
    quiz_round_description = room.quiz_round.description if room.quiz_round else None
    quiz_round_items_count = len(room.quiz_round.round_items) if (room.quiz_round and room.quiz_round.round_items) else None

    return RoomWithParticipants(
        id=room.id,
        quiz_id=room.quiz_id,
        quiz_round_id=getattr(room, "quiz_round_id", None),
        room_code=room.room_code,
        pin_code=room.pin_code,
        host_user_id=room.host_user_id,
        status=room.status,
        max_players=room.max_players,
        created_at=room.created_at,
        started_at=room.started_at,
        finished_at=room.finished_at,
        quiz_title=quiz_title,
        quiz_description=quiz_description,
        quiz_type=quiz_type,
        quiz_questions_count=quiz_questions_count,
        quiz_round_title=quiz_round_title,
        quiz_round_description=quiz_round_description,
        quiz_round_items_count=quiz_round_items_count,
        participants=[
            RoomParticipantResponse(
                id=p.id,
                room_id=p.room_id,
                user_id=p.user_id,
                guest_name=p.guest_name,
                guest_avatar=p.guest_avatar,
                is_host=p.is_host,
                is_active=p.is_active,
                joined_at=p.joined_at,
                left_at=p.left_at,
            )
            for p in participants
        ],
    )


def update_room(db: Session, room_id: str, room_update: RoomUpdate) -> Optional[Room]:
    """Update a room."""
    db_room = get_room(db, room_id)
    if not db_room:
        return None

    update_data = room_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_room, field, value)

    db.commit()
    db.refresh(db_room)
    return db_room


def delete_room(db: Session, room_id: str) -> bool:
    """Delete a room and all its participants."""
    room = get_room(db, room_id)
    if not room:
        return False

    db.delete(room)
    db.commit()
    return True


def add_participant(db: Session, participant: RoomParticipantCreate) -> RoomParticipant:
    """Add a participant to a room."""
    existing_participant = (
        db.query(RoomParticipant)
        .filter(
            and_(
                RoomParticipant.room_id == participant.room_id,
                RoomParticipant.is_active == True,
                (RoomParticipant.user_id == participant.user_id) if participant.user_id else True,
                RoomParticipant.guest_name == participant.guest_name,
            )
        )
        .first()
    )

    if existing_participant:
        return existing_participant

    # Remove any inactive participants with same identity
    db.query(RoomParticipant).filter(
        and_(
            RoomParticipant.room_id == participant.room_id,
            RoomParticipant.is_active == False,
            (RoomParticipant.user_id == participant.user_id) if participant.user_id else True,
            RoomParticipant.guest_name == participant.guest_name,
        )
    ).delete()

    db_participant = RoomParticipant(
        id=f"participant_{datetime.now().timestamp()}_{participant.guest_name.replace(' ', '_')}",
        room_id=participant.room_id,
        user_id=participant.user_id,
        guest_name=participant.guest_name,
        guest_avatar=participant.guest_avatar,
        is_host=participant.is_host,
    )

    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    return db_participant


def remove_participant(db: Session, participant_id: str) -> bool:
    """Remove a participant from a room (mark as inactive)."""
    participant = db.query(RoomParticipant).filter(RoomParticipant.id == participant_id).first()
    if not participant:
        return False

    participant.is_active = False
    participant.left_at = datetime.utcnow()

    db.commit()
    return True


def get_participants(db: Session, room_id: str) -> List[RoomParticipant]:
    """Get all active participants in a room."""
    return (
        db.query(RoomParticipant)
        .filter(
            and_(
                RoomParticipant.room_id == room_id,
                RoomParticipant.is_active == True,
            )
        )
        .all()
    )


def update_room_status(db: Session, room_id: str, status: str) -> Optional[Room]:
    """Update a room's status."""
    db_room = get_room(db, room_id)
    if not db_room:
        return None

    db_room.status = status
    if status == "started" and not db_room.started_at:
        db_room.started_at = datetime.utcnow()
    elif status == "finished" and not db_room.finished_at:
        db_room.finished_at = datetime.utcnow()

    db.commit()
    db.refresh(db_room)
    return db_room

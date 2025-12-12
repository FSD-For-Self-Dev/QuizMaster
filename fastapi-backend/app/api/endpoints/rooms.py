from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.room import (
    create_room, get_room, get_room_by_code, get_room_with_participants,
    update_room, delete_room, add_participant, remove_participant, get_participants
)
from app.schemas.room import (
    RoomCreate, RoomUpdate, RoomResponse, RoomWithParticipants,
    RoomParticipantCreate, RoomParticipantUpdate, RoomParticipantResponse
)
from app.api.endpoints.auth import get_current_user
from app.models.user import User
from app.api.websocket import send_room_update
from app.models.room_participant import RoomParticipant

router = APIRouter()


@router.post("/", response_model=RoomResponse)
def create_new_room(
    room: RoomCreate,
    # For demo purposes, allow room creation without authentication
    db: Session = Depends(get_db)
):
    """Create a new quiz room."""
    # For demo purposes, use a fixed host user ID
    host_user_id = "demo_host_user"
    created_room = create_room(db, room, host_user_id)
    
    # Add the host as a participant
    host_participant = add_participant(db, RoomParticipantCreate(
        room_id=created_room.id,
        user_id=host_user_id,
        guest_name="Host User",  # Default name for demo
        is_host=True
    ))
    
    return created_room


@router.get("/code/{room_code}", response_model=RoomWithParticipants)
def get_room_by_room_code(
    room_code: str,
    db: Session = Depends(get_db)
):
    """Get a room by its room code (for joining)."""
    room = get_room_by_code(db, room_code)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return get_room_with_participants(db, room.id)


@router.get("/{room_id}", response_model=RoomWithParticipants)
def get_room_info(
    room_id: str,
    db: Session = Depends(get_db)
):
    """Get room information with participants."""
    room = get_room_with_participants(db, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return room


@router.put("/{room_id}", response_model=RoomResponse)
def update_room_info(
    room_id: str,
    room_update: RoomUpdate,
    db: Session = Depends(get_db)
):
    """Update room information."""
    room = update_room(db, room_id, room_update)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return room


@router.delete("/{room_id}")
def delete_room_endpoint(
    room_id: str,
    db: Session = Depends(get_db)
):
    """Delete a room."""
    success = delete_room(db, room_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return {"message": "Room deleted successfully"}


@router.post("/{room_id}/participants", response_model=RoomParticipantResponse)
def join_room(
    room_id: str,
    participant: RoomParticipantCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Join a room as a participant."""
    # Verify room exists
    room = get_room(db, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    # Verify room is still accepting players
    current_participants = get_participants(db, room_id)
    if len(current_participants) >= room.max_players:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room is full"
        )

    # Update participant data with room_id
    participant.room_id = room_id

    # Add the participant
    new_participant = add_participant(db, participant)

    # Convert ORM -> Pydantic
    participant_schema = RoomParticipantResponse.model_validate(new_participant)

    try:
        updated_room = get_room_with_participants(db, room_id)
        if updated_room:
            if isinstance(updated_room, RoomWithParticipants):
                room_schema = updated_room
            else:
                room_schema = RoomWithParticipants.model_validate(updated_room)

            background_tasks.add_task(
                send_room_update,
                room_id,
                "room_state",
                room_schema.model_dump(),
            )
            background_tasks.add_task(
                send_room_update,
                room_id,
                "participant_joined",
                {"participant": participant_schema.model_dump()},
            )
    except Exception as e:
        print(f"Failed to broadcast participant join: {e}")

    return participant_schema


@router.delete("/participants/{participant_id}")
def leave_room(
    participant_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Leave a room."""
    participant = db.query(RoomParticipant).filter(RoomParticipant.id == participant_id).first()
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found"
        )

    room_id = participant.room_id

    success = remove_participant(db, participant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Failed to remove participant"
        )

    try:
        updated_room = get_room_with_participants(db, room_id)
        if updated_room:
            import asyncio

            # Normalize
            if isinstance(updated_room, RoomWithParticipants):
                room_schema = updated_room
            else:
                room_schema = RoomWithParticipants.model_validate(updated_room)

            background_tasks.add_task(
                send_room_update,
                room_id,
                "room_state",
                room_schema.model_dump(),
            )
            background_tasks.add_task(
                send_room_update,
                room_id,
                "participant_left",
                {"participant_id": participant_id},
            )
    except Exception as e:
        print(f"Failed to broadcast participant leave: {e}")

    return {"message": "Left room successfully"}


@router.get("/{room_id}/participants", response_model=List[RoomParticipantResponse])
def get_room_participants(
    room_id: str,
    db: Session = Depends(get_db)
):
    """Get all participants in a room."""
    participants = get_participants(db, room_id)
    return participants
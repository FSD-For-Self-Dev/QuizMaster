from typing import Optional, List
from pydantic import BaseModel, Field, model_validator
from datetime import datetime


class RoomCreate(BaseModel):
    # Provide exactly ONE of these:
    quiz_id: Optional[str] = None
    quiz_round_id: Optional[str] = None

    max_players: int = 50

    @model_validator(mode="after")
    def validate_target(self):
        # exactly one of quiz_id / quiz_round_id
        if bool(self.quiz_id) == bool(self.quiz_round_id):
            raise ValueError("Provide exactly one of quiz_id or quiz_round_id")
        return self


class RoomUpdate(BaseModel):
    status: Optional[str] = None
    max_players: Optional[int] = None


class RoomResponse(BaseModel):
    id: str

    # One of these will be set depending on mode
    quiz_id: Optional[str] = None
    quiz_round_id: Optional[str] = None

    room_code: str
    pin_code: str
    host_user_id: str
    status: str
    max_players: int
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    # Include quiz info (single quiz rooms)
    quiz_title: Optional[str] = None
    quiz_description: Optional[str] = None
    quiz_type: Optional[str] = None
    quiz_questions_count: Optional[int] = None

    # Optional: quiz round info (if you choose to populate it in your service)
    quiz_round_title: Optional[str] = None
    quiz_round_description: Optional[str] = None
    quiz_round_items_count: Optional[int] = None

    class Config:
        from_attributes = True


class RoomParticipantBase(BaseModel):
    room_id: str
    user_id: Optional[str] = None
    guest_name: str
    guest_avatar: Optional[str] = None
    is_host: bool = False


class RoomParticipantCreate(RoomParticipantBase):
    pass


class RoomParticipantUpdate(BaseModel):
    is_active: Optional[bool] = None
    left_at: Optional[datetime] = None


class RoomParticipantResponse(BaseModel):
    id: str
    room_id: str
    user_id: Optional[str] = None
    guest_name: str
    guest_avatar: Optional[str] = None
    is_host: bool
    is_active: bool
    joined_at: datetime
    left_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RoomWithParticipants(RoomResponse):
    participants: List[RoomParticipantResponse] = Field(default_factory=list)


# Update forward references
RoomWithParticipants.model_rebuild()
RoomParticipantResponse.model_rebuild()
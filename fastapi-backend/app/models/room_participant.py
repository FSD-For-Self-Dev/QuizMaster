from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    id = Column(String, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=True)  # NULL for guest users
    guest_name = Column(String, nullable=False)  # For guest users
    guest_avatar = Column(Text, nullable=True)  # Avatar URL or emoji for guest users
    is_host = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)  # Track if user is still in room
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    room = relationship("Room", back_populates="participants")
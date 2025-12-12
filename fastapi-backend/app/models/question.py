from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, index=True)
    quiz_id = Column(String, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    category = Column(String, nullable=True)  # For jeopardy quizzes
    question = Column(Text, nullable=False)
    type = Column(String, nullable=False)  # 'multiple_choice', 'true_false', 'short_answer', 'jeopardy'
    points = Column(Integer, nullable=True)  # For jeopardy quizzes
    order_index = Column(Integer, nullable=False)
    image_url = Column(String, nullable=True)
    audio_url = Column(String, nullable=True)
    media_type = Column(String, nullable=True)  # 'image', 'audio', 'video'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    quiz = relationship("Quiz", back_populates="questions", lazy="selectin")

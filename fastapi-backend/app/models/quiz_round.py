from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class QuizRound(Base):
    __tablename__ = "quiz_rounds"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    round_items = relationship(
        "QuizRoundItem",
        back_populates="quiz_round",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="QuizRoundItem.order_index"
    )

    rooms = relationship(
        "Room",
        back_populates="quiz_round",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class QuizRoundItem(Base):
    __tablename__ = "quiz_round_items"

    id = Column(String, primary_key=True, index=True)
    quiz_round_id = Column(String, ForeignKey("quiz_rounds.id", ondelete="CASCADE"), nullable=False)
    quiz_id = Column(String, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    quiz_round = relationship("QuizRound", back_populates="round_items")
    quiz = relationship("Quiz")

    @property
    def quiz_title(self) -> str:
        return self.quiz.title if self.quiz else ""

    @property
    def quiz_type(self) -> str:
        return self.quiz.type if self.quiz else ""

    @property
    def quiz_description(self) -> str | None:
        return self.quiz.description if self.quiz else None
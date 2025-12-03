from sqlalchemy import Column, String, Text, Integer, Boolean, ForeignKey

from app.models.base import Base


class Answer(Base):
    __tablename__ = "answers"

    id = Column(String, primary_key=True, index=True)
    question_id = Column(String, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    answer = Column(Text, nullable=False)
    is_correct = Column(Boolean, nullable=False, default=False)
    order_index = Column(Integer, nullable=False)
    media_url = Column(String, nullable=True)
    media_type = Column(String, nullable=True)  # 'image'

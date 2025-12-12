from sqlalchemy.orm import Session
from datetime import datetime
from typing import List

from app.models.question import Question
from app.schemas.question import QuestionCreate


def create_question(db: Session, question: QuestionCreate) -> Question:
    """Create a new question."""
    # Generate unique ID
    question_id = f"question_{datetime.now().timestamp()}"

    db_question = Question(
        id=question_id,
        quiz_id=question.quiz_id,
        category=question.category,
        question=question.question,
        type=question.type,
        points=question.points,
        order_index=question.order_index,
        image_url=question.image_url,
        audio_url=question.audio_url,
        media_type=question.media_type,
    )

    db.add(db_question)
    db.commit()
    db.refresh(db_question)
    return db_question


def get_questions_by_quiz(db: Session, quiz_id: str) -> List[Question]:
    """Return all questions for a given quiz, ordered by index."""
    return (
        db.query(Question)
        .filter(Question.quiz_id == quiz_id)
        .order_by(Question.order_index)
        .all()
    )

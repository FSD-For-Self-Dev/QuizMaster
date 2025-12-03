from sqlalchemy.orm import Session
from datetime import datetime

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
        media_url=question.media_url,
        media_type=question.media_type
    )

    db.add(db_question)
    db.commit()
    db.refresh(db_question)
    return db_question

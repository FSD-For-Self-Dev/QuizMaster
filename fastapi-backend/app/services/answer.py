from sqlalchemy.orm import Session
from typing import List

from app.models.answer import Answer
from app.schemas.answer import AnswerCreate


def create_answer(db: Session, answer: AnswerCreate) -> Answer:
    """Create a new answer."""
    # Generate unique ID
    import datetime
    answer_id = f"answer_{datetime.datetime.now().timestamp()}"

    db_answer = Answer(
        id=answer_id,
        question_id=answer.question_id,
        answer=answer.answer,
        is_correct=answer.is_correct,
        order_index=answer.order_index,
        media_url=answer.media_url,
        media_type=answer.media_type
    )

    db.add(db_answer)
    db.commit()
    db.refresh(db_answer)
    return db_answer


def get_answers_by_question(db: Session, question_id: str) -> List[Answer]:
    """Get all answers for a specific question."""
    return db.query(Answer).filter(Answer.question_id == question_id).order_by(Answer.order_index).all()

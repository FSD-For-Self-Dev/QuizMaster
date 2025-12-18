from typing import List, Optional
import json
from datetime import datetime

from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import func

from app.models.quiz_round import QuizRound, QuizRoundItem
from app.models.quiz import Quiz
from app.schemas.quiz_round import QuizRoundCreate, QuizRoundItemCreate


def create_quiz_round(db: Session, quiz_round: QuizRoundCreate) -> QuizRound:
    quiz_round_id = f"quiz_round_{datetime.now().timestamp()}_{quiz_round.title.replace(' ', '_')}"

    db_quiz_round = QuizRound(
        id=quiz_round_id,
        title=quiz_round.title,
        description=quiz_round.description
    )
    db.add(db_quiz_round)

    for i, item in enumerate(quiz_round.round_items):
        item_id = f"quiz_round_item_{datetime.now().timestamp()}_{i}"
        db.add(
            QuizRoundItem(
                id=item_id,
                quiz_round_id=quiz_round_id,
                quiz_id=item.quiz_id,
                order_index=item.order_index or i
            )
        )

    db.commit()

    # Re-load with round_items + their quiz
    return (
        db.query(QuizRound)
        .options(
            selectinload(QuizRound.round_items).selectinload(QuizRoundItem.quiz)
        )
        .filter(QuizRound.id == quiz_round_id)
        .first()
    )


def get_quiz_rounds(db: Session, skip: int = 0, limit: int = 100) -> List[QuizRound]:
    """Get all quiz rounds."""
    return (
        db.query(QuizRound)
        .outerjoin(QuizRoundItem)
        .group_by(QuizRound.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_quiz_round(db: Session, quiz_round_id: str) -> Optional[QuizRound]:
    """Get a quiz round by ID with its round items."""
    # return (
    #     db.query(QuizRound)
    #     .filter(QuizRound.id == quiz_round_id)
    #     .first()
    # )
    return (
        db.query(QuizRound)
        .options(joinedload(QuizRound.round_items))
        .filter(QuizRound.id == quiz_round_id)
        .first()
    )


def delete_quiz_round(db: Session, quiz_round_id: str) -> bool:
    """
    Delete a quiz round and cascade-delete its round items.
    Returns True if a quiz round was deleted, False if not found.
    """
    quiz_round = get_quiz_round(db, quiz_round_id)
    if not quiz_round:
        return False

    db.delete(quiz_round)
    db.commit()
    return True


def get_quiz_round_with_details(db: Session, quiz_round_id: str) -> Optional[QuizRound]:
    """Get a quiz round with detailed information about round items and their associated quizzes."""
    return (
        db.query(QuizRound)
        .options(
            # Eager load round items with their quiz details
        )
        .filter(QuizRound.id == quiz_round_id)
        .first()
    )


def get_available_quizzes_for_round(db: Session) -> List[Quiz]:
    """Get all available quizzes that can be used in quiz rounds."""
    return (
        db.query(Quiz)
        .order_by(Quiz.title)
        .all()
    )
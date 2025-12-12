from typing import List, Optional
import json
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.quiz import Quiz
from app.models.question import Question
from app.schemas.quiz import QuizCreate


def create_quiz(db: Session, quiz: QuizCreate) -> Quiz:
    """Create a new quiz."""
    # Generate unique ID
    quiz_id = f"quiz_{datetime.now().timestamp()}_{quiz.title.replace(' ', '_')}"

    # Convert settings to JSON string
    settings_json = json.dumps(quiz.settings.model_dump() if quiz.settings else {})

    db_quiz = Quiz(
        id=quiz_id,
        title=quiz.title,
        description=quiz.description,
        type=quiz.type,
        settings=settings_json
    )

    db.add(db_quiz)
    db.commit()
    db.refresh(db_quiz)
    return db_quiz


def get_quizzes(db: Session, skip: int = 0, limit: int = 100) -> List[Quiz]:
    """Get all quizzes."""
    return (
        db.query(
            Quiz,
            func.count(Question.id).label("questions_count")
        )
        .outerjoin(Question)
        .group_by(Quiz.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_quiz(db: Session, quiz_id: str) -> Optional[Quiz]:
    """Get a quiz by ID."""
    return db.query(Quiz).filter(Quiz.id == quiz_id).first()


def delete_quiz(db: Session, quiz_id: str) -> bool:
    """
    Delete a quiz and cascade-delete its related questions & answers.
    Returns True if a quiz was deleted, False if not found.
    """
    quiz = get_quiz(db, quiz_id)
    if not quiz:
        return False

    db.delete(quiz)
    db.commit()
    return True

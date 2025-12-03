from sqlalchemy.orm import Session
import json
from datetime import datetime

from app.models.game_session import GameSession
from app.schemas.game_session import GameSessionCreate


def create_game_session(db: Session, session: GameSessionCreate) -> GameSession:
    """Create a new game session."""
    # Generate unique ID
    session_id = f"session_{datetime.now().timestamp()}_{session.player_name}"

    # Convert answers to JSON string
    answers_json = json.dumps([answer.dict() for answer in session.answers])

    db_session = GameSession(
        id=session_id,
        quiz_id=session.quiz_id,
        player_name=session.player_name,
        score=session.score,
        answers=answers_json
    )

    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

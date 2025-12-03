from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.game_session import GameSession, GameSessionCreate
from app.services.game_session import create_game_session as create_game_session_service

router = APIRouter()


@router.post("/", response_model=GameSession)
def create_game_session(session: GameSessionCreate, db: Session = Depends(get_db)):
    """
    Create a new game session.
    """
    return create_game_session_service(db=db, session=session)

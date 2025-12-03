from fastapi import APIRouter

from app.api.endpoints import auth, quizzes, questions, answers, game_sessions

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(quizzes.router, prefix="/quizzes", tags=["quizzes"])
api_router.include_router(questions.router, prefix="/questions", tags=["questions"])
api_router.include_router(answers.router, prefix="/answers", tags=["answers"])
api_router.include_router(game_sessions.router, prefix="/game-sessions", tags=["game-sessions"])

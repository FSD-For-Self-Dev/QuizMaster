# QuizMaster FastAPI Backend

A FastAPI backend for the QuizMaster quiz application.

## Features

- **Authentication**: JWT-based authentication with user registration and login
- **Quiz Management**: Create and manage quizzes of different types (classic, jeopardy)
- **Question & Answer Management**: Handle questions and multiple choice answers
- **Game Sessions**: Track quiz game sessions and scores
- **SQLite Database**: Lightweight database for development and production

## Installation

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Copy environment variables:
```bash
cp env.example .env
```

4. Update the `.env` file with your configuration (especially the SECRET_KEY)

## Running the Application

### Development
```bash
uvicorn main:app --reload
```

### Production
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/api/v1/docs
- **ReDoc**: http://localhost:8000/api/v1/redoc

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login and get JWT token
- `GET /api/v1/auth/me` - Get current user info

### Quizzes
- `GET /api/v1/quizzes` - Get all quizzes
- `POST /api/v1/quizzes` - Create a new quiz
- `GET /api/v1/quizzes/{id}` - Get specific quiz

### Questions
- `POST /api/v1/questions` - Create a question
- `GET /api/v1/questions/{id}/answers` - Get answers for a question

### Answers
- `POST /api/v1/answers` - Create an answer

### Game Sessions
- `POST /api/v1/game-sessions` - Create a game session

## Project Structure

```
fastapi-backend/
├── app/
│   ├── api/
│   │   ├── endpoints/     # API endpoint handlers
│   │   └── routes.py      # Main API router
│   ├── core/
│   │   └── config.py      # Application settings
│   ├── db/                # Database configuration
│   ├── models/            # SQLAlchemy models
│   ├── schemas/           # Pydantic schemas
│   └── services/          # Business logic
├── main.py                # FastAPI application
├── requirements.txt       # Python dependencies
└── README.md
```

#!/usr/bin/env python3
"""
Database initialization script.
Run this to create all database tables.
"""

from app.db.session import create_tables

if __name__ == "__main__":
    print("Creating database tables...")
    create_tables()
    print("Database tables created successfully!")

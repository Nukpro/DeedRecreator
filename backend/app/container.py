from __future__ import annotations

from flask import current_app

from backend.services import DocumentService
from backend.services.session_service import SessionService

DOCUMENT_SERVICE_KEY = "document_service"
SESSION_SERVICE_KEY = "session_service"


def register_services(app) -> None:
    """Pre-instantiate core services and store them on the application."""
    with app.app_context():
        document_service = DocumentService.from_app_config()
        app.extensions[DOCUMENT_SERVICE_KEY] = document_service
        
        session_service = SessionService.from_app_config()
        app.extensions[SESSION_SERVICE_KEY] = session_service


def get_document_service() -> DocumentService:
    """Return the shared document service instance."""
    service = current_app.extensions.get(DOCUMENT_SERVICE_KEY)
    if service is None:
        service = DocumentService.from_app_config()
        current_app.extensions[DOCUMENT_SERVICE_KEY] = service
    return service


def get_session_service() -> SessionService:
    """Return the shared session service instance."""
    service = current_app.extensions.get(SESSION_SERVICE_KEY)
    if service is None:
        service = SessionService.from_app_config()
        current_app.extensions[SESSION_SERVICE_KEY] = service
    return service


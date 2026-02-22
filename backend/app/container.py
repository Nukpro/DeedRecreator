from __future__ import annotations

from flask import current_app

from backend.services import DocumentService
from backend.services.site_session_service import SiteSessionService
from backend.geometry import GeometryService

DOCUMENT_SERVICE_KEY = "document_service"
SITE_SESSION_SERVICE_KEY = "site_session_service"
GEOMETRY_SERVICE_KEY = "geometry_service"


def register_services(app) -> None:
    """Pre-instantiate core services and store them on the application."""
    with app.app_context():
        document_service = DocumentService.from_app_config()
        app.extensions[DOCUMENT_SERVICE_KEY] = document_service

        site_session_service = SiteSessionService.from_app_config()
        app.extensions[SITE_SESSION_SERVICE_KEY] = site_session_service

        geometry_service = GeometryService(site_session_service)
        app.extensions[GEOMETRY_SERVICE_KEY] = geometry_service


def get_document_service() -> DocumentService:
    """Return the shared document service instance."""
    service = current_app.extensions.get(DOCUMENT_SERVICE_KEY)
    if service is None:
        service = DocumentService.from_app_config()
        current_app.extensions[DOCUMENT_SERVICE_KEY] = service
    return service


def get_site_session_service() -> SiteSessionService:
    """Return the shared site session service instance."""
    service = current_app.extensions.get(SITE_SESSION_SERVICE_KEY)
    if service is None:
        service = SiteSessionService.from_app_config()
        current_app.extensions[SITE_SESSION_SERVICE_KEY] = service
    return service


def get_geometry_service() -> GeometryService:
    """Return the shared geometry service instance."""
    service = current_app.extensions.get(GEOMETRY_SERVICE_KEY)
    if service is None:
        site_session_service = get_site_session_service()
        service = GeometryService(site_session_service)
        current_app.extensions[GEOMETRY_SERVICE_KEY] = service
    return service

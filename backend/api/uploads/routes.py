from __future__ import annotations

from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory, url_for

from backend.app.container import get_document_service, get_site_session_service
from backend.services.document_service import (
    DocumentStorageError,
    UnsupportedDocumentError,
)
from backend.services.site_session_service import SiteSessionNotFoundError

uploads_bp = Blueprint("uploads", __name__)


@uploads_bp.post("/api/upload-document")
def upload_document():
    """Upload document to a site session directory. Site session ID is required."""
    file = request.files.get("document")
    site_session_id = None

    site_session_id = request.args.get("site_session_id", type=int)

    if not site_session_id and request.form:
        site_session_id = request.form.get("site_session_id", type=int)

    if not site_session_id and request.is_json:
        json_site_session_id = request.json.get("site_session_id")
        if json_site_session_id is not None:
            try:
                site_session_id = int(json_site_session_id)
            except (ValueError, TypeError):
                pass

    if not site_session_id:
        return jsonify({"message": "site_session_id is required"}), 400

    document_service = get_document_service()

    try:
        site_session_service = get_site_session_service()
        site_session = site_session_service.get_site_session(site_session_id)

        instance_path = Path(current_app.instance_path).resolve()
        catalog_name = site_session["storage_catalog_name"]
        site_sessions_dir = instance_path / "site_sessions_id_"
        site_session_dir = site_sessions_dir / catalog_name

        current_app.logger.debug(
            f"Instance path: {instance_path}, exists: {instance_path.exists()}"
        )
        current_app.logger.debug(f"Site session dir: {site_session_dir}")

        site_session_upload_dir = site_session_dir / "uploads"
        site_session_processed_dir = site_session_dir / "processed_drawing"

        site_session_upload_dir.mkdir(parents=True, exist_ok=True)
        site_session_processed_dir.mkdir(parents=True, exist_ok=True)

        current_app.logger.debug(
            f"Site session upload dir: {site_session_upload_dir}, exists: {site_session_upload_dir.exists()}"
        )
        current_app.logger.debug(
            f"Site session processed dir: {site_session_processed_dir}, exists: {site_session_processed_dir.exists()}"
        )

    except SiteSessionNotFoundError:
        return (
            jsonify(
                {"message": f"Site session {site_session_id} not found"}
            ),
            404,
        )
    except Exception as e:
        current_app.logger.error(
            f"Error getting site session directories: {e}", exc_info=True
        )
        return jsonify({"message": "Internal server error"}), 500

    current_app.logger.info(
        f"Uploading document for site session {site_session_id} to {site_session_upload_dir}"
    )

    try:
        stored_document = document_service.save_document(
            file,
            site_session_upload_dir=site_session_upload_dir,
            site_session_processed_dir=site_session_processed_dir,
        )
    except UnsupportedDocumentError as exc:
        return jsonify({"message": str(exc)}), 400
    except DocumentStorageError as exc:
        return jsonify({"message": str(exc)}), 500

    if stored_document.stored_relative_path:
        try:
            site_session_service.update_site_session(
                site_session_id=site_session_id,
                processed_drawing=stored_document.stored_relative_path,
            )
        except SiteSessionNotFoundError:
            current_app.logger.warning(
                f"Site session {site_session_id} was deleted after upload"
            )
        except Exception as e:
            current_app.logger.error(
                f"Error updating site session {site_session_id}: {e}",
                exc_info=True,
            )

    return (
        jsonify(
            {
                "message": "Document stored successfully.",
                "payload": {
                    "originalFilename": stored_document.original_filename,
                    "originalStoredFilename": stored_document.original_stored_filename,
                    "originalStoredRelativePath": stored_document.original_stored_relative_path,
                    "storedFilename": stored_document.stored_filename,
                    "storedRelativePath": stored_document.stored_relative_path,
                    "wasConverted": stored_document.was_converted,
                    "imageUrl": url_for(
                        "uploads.serve_uploaded_file",
                        site_session_id=site_session_id,
                        filename=stored_document.stored_filename,
                    ),
                    "originalUrl": url_for(
                        "uploads.serve_uploaded_file",
                        site_session_id=site_session_id,
                        filename=stored_document.original_stored_filename,
                    ),
                    "warnings": stored_document.warnings,
                    "imageWidth": stored_document.image_width,
                    "imageHeight": stored_document.image_height,
                    "boundaryBox": stored_document.boundary_box,
                },
            }
        ),
        201,
    )


@uploads_bp.get("/uploads/<int:site_session_id>/<path:filename>")
def serve_uploaded_file(site_session_id: int, filename: str):
    """Serve uploaded file from site session directory."""
    try:
        site_session_service = get_site_session_service()
        site_session = site_session_service.get_site_session(site_session_id)

        instance_path = Path(current_app.instance_path).resolve()
        catalog_name = site_session["storage_catalog_name"]
        site_sessions_dir = instance_path / "site_sessions_id_"
        site_session_dir = site_sessions_dir / catalog_name

        uploads_dir = site_session_dir / "uploads"
        processed_dir = site_session_dir / "processed_drawing"

        if (uploads_dir / filename).exists():
            return send_from_directory(
                uploads_dir, filename, as_attachment=False
            )
        elif (processed_dir / filename).exists():
            return send_from_directory(
                processed_dir, filename, as_attachment=False
            )
        else:
            return (
                jsonify(
                    {
                        "message": f"File {filename} not found in site session {site_session_id}"
                    }
                ),
                404,
            )

    except SiteSessionNotFoundError:
        return (
            jsonify(
                {"message": f"Site session {site_session_id} not found"}
            ),
            404,
        )
    except Exception as e:
        current_app.logger.error(
            f"Error serving file {filename} for site session {site_session_id}: {e}",
            exc_info=True,
        )
        return jsonify({"message": "Internal server error"}), 500

from __future__ import annotations

from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory, url_for

from backend.app.container import get_document_service, get_session_service
from backend.services.document_service import DocumentStorageError, UnsupportedDocumentError
from backend.services.session_service import SessionNotFoundError

uploads_bp = Blueprint("uploads", __name__)


@uploads_bp.post("/api/upload-document")
def upload_document():
    """Upload document to a session directory. Session ID is required."""
    file = request.files.get("document")
    # Try to get session_id from multiple sources: URL params, FormData, or JSON body
    session_id = None
    
    # Try URL parameters first
    session_id = request.args.get("session_id", type=int)
    
    # Try FormData if not found in URL
    if not session_id and request.form:
        session_id = request.form.get("session_id", type=int)
    
    # Try JSON body if still not found
    if not session_id and request.is_json:
        json_session_id = request.json.get("session_id")
        if json_session_id is not None:
            try:
                session_id = int(json_session_id)
            except (ValueError, TypeError):
                pass

    # Session ID is now required
    if not session_id:
        return jsonify({"message": "session_id is required"}), 400

    document_service = get_document_service()
    
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        # Get session directory paths - use the same method as SessionService
        # SessionService uses: instance_path / "sessions_id_" / catalog_name
        # Ensure we use the same instance_path resolution as SessionService
        instance_path = Path(current_app.instance_path).resolve()
        catalog_name = session["storage_catalog_name"]
        sessions_dir = instance_path / "sessions_id_"
        session_dir = sessions_dir / catalog_name
        
        # Debug: verify instance_path is correct
        current_app.logger.debug(f"Instance path: {instance_path}, exists: {instance_path.exists()}")
        current_app.logger.debug(f"Session dir: {session_dir}")
        
        session_upload_dir = session_dir / "uploads"
        session_processed_dir = session_dir / "processed_drawing"
        
        # Ensure directories exist
        session_upload_dir.mkdir(parents=True, exist_ok=True)
        session_processed_dir.mkdir(parents=True, exist_ok=True)
        
        # Verify paths are correct (debug)
        current_app.logger.debug(
            f"Session upload dir: {session_upload_dir}, exists: {session_upload_dir.exists()}"
        )
        current_app.logger.debug(
            f"Session processed dir: {session_processed_dir}, exists: {session_processed_dir.exists()}"
        )
        
    except SessionNotFoundError:
        return jsonify({"message": f"Session {session_id} not found"}), 404
    except Exception as e:
        current_app.logger.error(f"Error getting session directories: {e}", exc_info=True)
        return jsonify({"message": "Internal server error"}), 500

    current_app.logger.info(
        f"Uploading document for session {session_id} to {session_upload_dir}"
    )

    try:
        stored_document = document_service.save_document(
            file,
            session_upload_dir=session_upload_dir,
            session_processed_dir=session_processed_dir,
        )
    except UnsupportedDocumentError as exc:
        return jsonify({"message": str(exc)}), 400
    except DocumentStorageError as exc:
        return jsonify({"message": str(exc)}), 500

    # Update session with processed_drawing path
    if stored_document.stored_relative_path:
        try:
            session_service.update_session(
                session_id=session_id,
                processed_drawing=stored_document.stored_relative_path,
            )
        except SessionNotFoundError:
            # Session was deleted, continue anyway
            current_app.logger.warning(f"Session {session_id} was deleted after upload")
        except Exception as e:
            current_app.logger.error(f"Error updating session {session_id}: {e}", exc_info=True)

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
                        session_id=session_id,
                        filename=stored_document.stored_filename,
                    ),
                    "originalUrl": url_for(
                        "uploads.serve_uploaded_file",
                        session_id=session_id,
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


@uploads_bp.get("/uploads/<int:session_id>/<path:filename>")
def serve_uploaded_file(session_id: int, filename: str):
    """Serve uploaded file from session directory."""
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        # Get session directory path
        instance_path = Path(current_app.instance_path).resolve()
        catalog_name = session["storage_catalog_name"]
        sessions_dir = instance_path / "sessions_id_"
        session_dir = sessions_dir / catalog_name
        
        # Try to find file in uploads or processed_drawing directories
        uploads_dir = session_dir / "uploads"
        processed_dir = session_dir / "processed_drawing"
        
        # Check in uploads first, then processed_drawing
        if (uploads_dir / filename).exists():
            return send_from_directory(uploads_dir, filename, as_attachment=False)
        elif (processed_dir / filename).exists():
            return send_from_directory(processed_dir, filename, as_attachment=False)
        else:
            return jsonify({"message": f"File {filename} not found in session {session_id}"}), 404
            
    except SessionNotFoundError:
        return jsonify({"message": f"Session {session_id} not found"}), 404
    except Exception as e:
        current_app.logger.error(f"Error serving file {filename} for session {session_id}: {e}", exc_info=True)
        return jsonify({"message": "Internal server error"}), 500


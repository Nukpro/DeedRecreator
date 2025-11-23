from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Type


class Config:
    """Base application configuration."""

    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me")
    SQLALCHEMY_DATABASE_URI: str = os.getenv(
        "DATABASE_URL",
        os.getenv(
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///app.db",
        ),
    )
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", "instance/uploads"))


class DevelopmentConfig(Config):
    DEBUG: bool = True


class ProductionConfig(Config):
    DEBUG: bool = False


CONFIG_MAP: Dict[str, Type[Config]] = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": Config,
}


def resolve_config(config_name: str | None) -> Type[Config]:
    """Return the configuration class for the given name."""
    if not config_name:
        return CONFIG_MAP["default"]
    return CONFIG_MAP.get(config_name, CONFIG_MAP["default"])


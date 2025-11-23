from backend.app import create_app

app = create_app()


if __name__ == "__main__":
    debug = app.config.get("DEBUG", False)
    app.run(debug=debug)
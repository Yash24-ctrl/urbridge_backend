from ml_service import app


if __name__ == "__main__":
    from ml_service import ensure_support_services

    ensure_support_services()
    app.run(host="127.0.0.1", port=5001, debug=False, threaded=True)

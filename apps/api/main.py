from fastapi import FastAPI

app = FastAPI(title="AutoEDA API")

@app.get("/health")
def health():
    return {"status": "ok"}


import os
import sys
from pathlib import Path

service = Path(__file__).resolve().parent
if os.name == "nt":
    venv_python = service / ".venv" / "Scripts" / "python.exe"
else:
    venv_python = service / ".venv" / "bin" / "python"

if venv_python.exists() and Path(sys.executable).resolve() != venv_python.resolve():
    os.execv(str(venv_python), [str(venv_python), "-m", "uvicorn", "app.main:app", "--reload", "--app-dir", str(service), "--port", "8000"])

sys.path.insert(0, str(service))
try:
    import uvicorn
except ImportError as error:
    raise SystemExit("AI dependencies are missing. Install ai-service/requirements.txt into ai-service/.venv first.") from error

uvicorn.run("app.main:app", app_dir=str(service), host="127.0.0.1", port=8000, reload=True)

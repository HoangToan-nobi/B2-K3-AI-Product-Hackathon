from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[2]
CODEBASE_ROOT = BACKEND_ROOT.parent
REPO_ROOT = CODEBASE_ROOT.parent
SHARED_DIR = CODEBASE_ROOT / "shared"
PIPELINE_DIR = CODEBASE_ROOT / "pipeline"
EVAL_RUNS_DIR = REPO_ROOT / "eval" / "runs"
LOCAL_DB_PATH = SHARED_DIR / "local-db.json"
FALLBACK_SLIDE_PDF = REPO_ROOT / "data" / "vlearn-pack" / "slides" / "d1-slide-hackathon.pdf"


LESSON_MAPPINGS = {
    "day1-foundation": {
        "lesson_id": "day1-foundation",
        "title": "AI & LLM Foundation (Day 1)",
        "slide_pdf": str(FALLBACK_SLIDE_PDF),
        "chatlog_csv": str(REPO_ROOT / "data" / "vlearn-pack" / "chatlog" / "chat_history_anonymized_for_hackathon.csv"),
        "day_codes": ["Day 1", "Day1-C302", "Day1-C401", "New learning material"],
        "max_page": 29,
        "mapping_signals": ["day_code/page/slide keyword mapping from VLearn export"],
    },
    "day2-prompting": {
        "lesson_id": "day2-prompting",
        "title": "Prompting & Context (Day 2)",
        "slide_pdf": str(REPO_ROOT / "data" / "vlearn-pack" / "slides" / "d2-slide-hackathon.pdf"),
        "chatlog_csv": str(REPO_ROOT / "data" / "vlearn-pack" / "chatlog" / "chat_history_anonymized_for_hackathon.csv"),
        "day_codes": ["Day 2", "Day2", "Lecture_material_ms203vsq_ob7vqp"],
        "max_page": 999,
        "mapping_signals": ["day_code/page/slide keyword mapping from VLearn export"],
    },
    "day3-rag": {
        "lesson_id": "day3-rag",
        "title": "RAG & Knowledge Grounding (Day 3)",
        "slide_pdf": str(REPO_ROOT / "data" / "vlearn-pack" / "slides" / "d3-slide-hackathon.pdf"),
        "chatlog_csv": str(REPO_ROOT / "data" / "vlearn-pack" / "chatlog" / "chat_history_anonymized_for_hackathon.csv"),
        "day_codes": ["Day 3", "Day3"],
        "max_page": 999,
        "mapping_signals": ["day_code/page/slide keyword mapping from VLearn export"],
    },
    "day4-agents": {
        "lesson_id": "day4-agents",
        "title": "AI Agents & Tools (Day 4)",
        "slide_pdf": str(REPO_ROOT / "data" / "vlearn-pack" / "slides" / "d4-slide-hackathon.pdf"),
        "chatlog_csv": str(REPO_ROOT / "data" / "vlearn-pack" / "chatlog" / "chat_history_anonymized_for_hackathon.csv"),
        "day_codes": ["Day 4", "Day4"],
        "max_page": 999,
        "mapping_signals": ["day_code/page/slide keyword mapping from VLearn export"],
    },
    "day5-product": {
        "lesson_id": "day5-product",
        "title": "AI Product Hackathon (Day 5)",
        "slide_pdf": str(REPO_ROOT / "data" / "vlearn-pack" / "slides" / "d5-slide-hackathon.pdf"),
        "chatlog_csv": str(REPO_ROOT / "data" / "vlearn-pack" / "chatlog" / "chat_history_anonymized_for_hackathon.csv"),
        "day_codes": ["Day 5", "Day5"],
        "max_page": 999,
        "mapping_signals": ["day_code/page/slide keyword mapping from VLearn export"],
    },
}


def get_lesson_mapping(lesson_id: str = "day1-foundation") -> dict:
    try:
        return LESSON_MAPPINGS[lesson_id]
    except KeyError as exc:
        raise ValueError(f"Unknown lesson_id: {lesson_id}") from exc


def get_pack_path(lesson_id: str = "day1-foundation") -> Path:
    return SHARED_DIR / f"review-pack-{lesson_id}.json"


def get_pdf_path(pack_id: str) -> Path:
    return SHARED_DIR / "exports" / f"{pack_id}.pdf"

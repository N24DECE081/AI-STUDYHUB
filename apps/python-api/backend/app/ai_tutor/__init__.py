"""AI Tutor domain: engine abstraction, roadmap, grading and persistence."""
from .engine import EngineError, LocalEngine, ProviderEngine, get_engine
from .grading import GradingError, grade_exercise, validate_result
from .roadmap import RoadmapError, adapt, build_exercises, build_roadmap, start_assessment, summarize_answers

__all__ = [
    'EngineError',
    'GradingError',
    'LocalEngine',
    'ProviderEngine',
    'RoadmapError',
    'adapt',
    'build_exercises',
    'build_roadmap',
    'get_engine',
    'grade_exercise',
    'start_assessment',
    'summarize_answers',
    'validate_result',
]

"""Utility scripts for QA automation."""

from . import merge_quality_reports as merge_quality_reports  # re-export module
from .merge_quality_reports import merge_reports  # re-export function conveniences

__all__ = [
    "merge_quality_reports",
    "merge_reports",
]

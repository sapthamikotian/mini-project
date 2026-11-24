"""Shared pagination helper so every list endpoint behaves consistently."""
from __future__ import annotations

import math

from sqlalchemy.orm import Query


def paginate(query: Query, page: int, page_size: int) -> tuple[list, int, int]:
    """Returns (items_for_this_page, total_row_count, total_page_count)."""
    total = query.count()
    pages = max(1, math.ceil(total / page_size))
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total, pages

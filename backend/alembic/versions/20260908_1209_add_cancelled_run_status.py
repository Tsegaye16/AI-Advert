"""add cancelled run status

Revision ID: f989e25ebd82
Revises: ce149a78d2f7
Create Date: 2026-09-08 12:09:03.164916
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f989e25ebd82'
down_revision: Union[str, None] = 'ce149a78d2f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Widen runs.status to accept CANCELLED.

    SQLAlchemy's Enum defaults to ``create_constraint=False``, so on SQLite the
    column is a plain VARCHAR with nothing to alter — rebuilding the table there
    would risk live data for no gain. PostgreSQL uses a native enum type that
    does need a new label.
    """
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE runstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    # Cancelled runs have no pre-existing equivalent, so fold them into FAILED.
    # PostgreSQL cannot drop an enum label, so the type is left as-is.
    op.execute("UPDATE runs SET status = 'FAILED' WHERE status = 'CANCELLED'")

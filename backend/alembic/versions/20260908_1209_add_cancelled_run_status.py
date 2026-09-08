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

OLD_STATUSES = ("QUEUED", "RUNNING", "STORYBOARD", "SUCCEEDED", "FAILED")
NEW_STATUSES = (*OLD_STATUSES, "CANCELLED")


def upgrade() -> None:
    # SQLAlchemy renders Enum as VARCHAR + CHECK on SQLite, so the constraint has
    # to be rewritten for the new member. Autogenerate does not diff CHECK.
    with op.batch_alter_table("runs") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.Enum(*OLD_STATUSES, name="runstatus"),
            type_=sa.Enum(*NEW_STATUSES, name="runstatus"),
            existing_nullable=False,
        )


def downgrade() -> None:
    # Cancelled runs have no pre-existing equivalent; fold them into FAILED so
    # the narrower constraint can be applied.
    op.execute("UPDATE runs SET status = 'FAILED' WHERE status = 'CANCELLED'")
    with op.batch_alter_table("runs") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.Enum(*NEW_STATUSES, name="runstatus"),
            type_=sa.Enum(*OLD_STATUSES, name="runstatus"),
            existing_nullable=False,
        )

"""STEP-first wall resonance panel for the stairs sound-wall study.

Coordinate convention: x is panel width, y is wall depth, z is vertical height.
The panel is centered on the origin so the web preview can be scaled directly
from millimetres to metres.
"""

from math import cos, pi

from build123d import Align, Box, Cylinder, Pos, Rot


PANEL_WIDTH = 900.0
PANEL_HEIGHT = 2100.0
PANEL_DEPTH = 80.0
FRAME_WIDTH = 55.0
RELIEF_DEPTH = 10.0
BASE_DEPTH = PANEL_DEPTH - RELIEF_DEPTH
RIB_WIDTH = 18.0
RIB_COUNT = 9
MOUNT_DIAMETER = 8.0
MOUNT_OFFSET = 70.0


def centered_box(width: float, depth: float, height: float, x: float, y: float, z: float):
    return Pos(x, y, z) * Box(
        width,
        depth,
        height,
        align=(Align.CENTER, Align.CENTER, Align.CENTER),
    )


def mounting_hole(x: float, z: float):
    # Cylinder is created along z and rotated so the cutter passes through y.
    return Pos(x, 0, z) * Rot(90, 0, 0) * Cylinder(
        MOUNT_DIAMETER / 2,
        PANEL_DEPTH + 8,
        align=(Align.CENTER, Align.CENTER, Align.CENTER),
    )


def gen_step():
    base = centered_box(PANEL_WIDTH, BASE_DEPTH, PANEL_HEIGHT, 0, 0, 0)
    front_y = -(BASE_DEPTH / 2 + RELIEF_DEPTH / 2)
    reliefs = [
        centered_box(FRAME_WIDTH, RELIEF_DEPTH, PANEL_HEIGHT, -(PANEL_WIDTH - FRAME_WIDTH) / 2, front_y, 0),
        centered_box(FRAME_WIDTH, RELIEF_DEPTH, PANEL_HEIGHT, (PANEL_WIDTH - FRAME_WIDTH) / 2, front_y, 0),
        centered_box(PANEL_WIDTH - 2 * FRAME_WIDTH, RELIEF_DEPTH, FRAME_WIDTH, 0, front_y, -(PANEL_HEIGHT - FRAME_WIDTH) / 2),
        centered_box(PANEL_WIDTH - 2 * FRAME_WIDTH, RELIEF_DEPTH, FRAME_WIDTH, 0, front_y, (PANEL_HEIGHT - FRAME_WIDTH) / 2),
    ]

    # The longitudinal ribs reinterpret a foxtail spike as a shallow, repeated
    # structural motif. Their changing height keeps the panel visibly directional.
    inner_width = PANEL_WIDTH - 2 * FRAME_WIDTH - 80
    for index in range(RIB_COUNT):
        ratio = index / (RIB_COUNT - 1)
        x = -inner_width / 2 + ratio * inner_width
        height = PANEL_HEIGHT - 2 * FRAME_WIDTH - 240 - 240 * abs(cos(ratio * pi))
        z = 35 * cos(ratio * pi)
        reliefs.append(centered_box(RIB_WIDTH, RELIEF_DEPTH, height, x, front_y, z))

    # Two cross braces make the wall module read as a panel rather than a set of
    # floating strips, while leaving several narrow visual channels between ribs.
    for z in (-430.0, 430.0):
        reliefs.append(centered_box(inner_width, RELIEF_DEPTH, 16.0, 0, front_y, z))

    panel = base
    for relief in reliefs:
        panel = panel.fuse(relief)

    mount_x = PANEL_WIDTH / 2 - MOUNT_OFFSET
    mount_z = PANEL_HEIGHT / 2 - MOUNT_OFFSET
    for x in (-mount_x, mount_x):
        for z in (-mount_z, mount_z):
            panel = panel.cut(mounting_hole(x, z))

    panel.label = "foxtail_resonance_panel_900x2100x80mm"
    return panel

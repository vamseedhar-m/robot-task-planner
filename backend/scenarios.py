SCENARIO_WAREHOUSE_SORT = {
    "id": "warehouse_sort",
    "name": "Warehouse Weight Sort",
    "description": "Sort boxes from intake conveyor to shelves by weight category",
    "task_description": (
        "Pick up the red box from the intake conveyor and sort it by weight: "
        "if it weighs under 0.5kg place it on shelf A (light items), "
        "if it weighs 0.5kg-2kg place it on shelf B (medium items), "
        "and if it weighs over 2kg place it on shelf C (heavy items). "
        "After placing, return to home position."
    ),
    "scene": {
        "task_description": (
            "Pick up the red box from the intake conveyor and sort it by weight: "
            "if it weighs under 0.5kg place it on shelf A (light items), "
            "if it weighs 0.5kg-2kg place it on shelf B (medium items), "
            "and if it weighs over 2kg place it on shelf C (heavy items). "
            "After placing, return to home position."
        ),
        "objects": [
            {
                "id": "red_box",
                "name": "Red Box",
                "type": "box",
                "color": "red",
                "location": {"x": 0.25, "y": 0.65, "z": 0.05},
                "properties": {
                    "weight_kg": 0.35,
                    "fragility": "low",
                    "size": {"width": 0.15, "height": 0.12, "depth": 0.10}
                }
            }
        ],
        "locations": [
            {
                "id": "intake_conveyor",
                "name": "Intake Conveyor",
                "position": {"x": 0.25, "y": 0.65, "z": 0.0},
                "type": "conveyor"
            },
            {
                "id": "shelf_a",
                "name": "Shelf A (Light <0.5kg)",
                "position": {"x": -0.40, "y": 0.50, "z": 0.35},
                "type": "shelf"
            },
            {
                "id": "shelf_b",
                "name": "Shelf B (Medium 0.5-2kg)",
                "position": {"x": -0.40, "y": 0.50, "z": 0.20},
                "type": "shelf"
            },
            {
                "id": "shelf_c",
                "name": "Shelf C (Heavy >2kg)",
                "position": {"x": -0.40, "y": 0.50, "z": 0.05},
                "type": "shelf"
            }
        ],
        "robot_constraints": {
            "max_payload_kg": 3.0,
            "reach_radius_m": 0.9,
            "max_grip_force_n": 60.0,
            "max_speed_ms": 0.8,
            "workspace_bounds": {
                "x_min": -0.65,
                "x_max": 0.65,
                "y_min": 0.10,
                "y_max": 0.90,
                "z_min": 0.0,
                "z_max": 0.70
            }
        }
    }
}

SCENARIO_QC_GATE = {
    "id": "qc_gate",
    "name": "Assembly Line QC Gate",
    "description": "Inspect a part and route it to pass or reject bin",
    "task_description": (
        "Pick up the engine component from the inspection station, perform a visual and "
        "dimensional inspection, then route it to the pass bin if all checks pass or to "
        "the reject bin if it fails any check. Return to home position when done."
    ),
    "scene": {
        "task_description": (
            "Pick up the engine component from the inspection station, perform a visual and "
            "dimensional inspection, then route it to the pass bin if all checks pass or to "
            "the reject bin if it fails any check. Return to home position when done."
        ),
        "objects": [
            {
                "id": "engine_component",
                "name": "Engine Component",
                "type": "machined_part",
                "color": "silver",
                "location": {"x": 0.30, "y": 0.55, "z": 0.05},
                "properties": {
                    "weight_kg": 0.45,
                    "fragility": "medium",
                    "size": {"width": 0.08, "height": 0.06, "depth": 0.08}
                }
            }
        ],
        "locations": [
            {
                "id": "inspection_station",
                "name": "Inspection Station",
                "position": {"x": 0.30, "y": 0.55, "z": 0.0},
                "type": "station"
            },
            {
                "id": "pass_bin",
                "name": "Pass Bin",
                "position": {"x": -0.35, "y": 0.60, "z": 0.0},
                "type": "bin"
            },
            {
                "id": "reject_bin",
                "name": "Reject Bin",
                "position": {"x": -0.35, "y": 0.30, "z": 0.0},
                "type": "bin"
            }
        ],
        "robot_constraints": {
            "max_payload_kg": 2.0,
            "reach_radius_m": 0.80,
            "max_grip_force_n": 35.0,
            "max_speed_ms": 0.40,
            "workspace_bounds": {
                "x_min": -0.60,
                "x_max": 0.60,
                "y_min": 0.10,
                "y_max": 0.85,
                "z_min": 0.0,
                "z_max": 0.65
            }
        }
    }
}

SCENARIO_KITTING = {
    "id": "kitting",
    "name": "Sensor Kit Assembly",
    "description": "Assemble a 4-component kit from separate bins into a kit tray",
    "task_description": (
        "Assemble a sensor kit by picking one M4 bolt from the bolt bin, one M4 nut from "
        "the nut bin, one flat washer from the washer bin, and one spring from the spring bin. "
        "Place each component into the kit tray in that exact order. The components are small "
        "and fragile — use gentle grip force. Return to home when the kit is complete."
    ),
    "scene": {
        "task_description": (
            "Assemble a sensor kit by picking one M4 bolt from the bolt bin, one M4 nut from "
            "the nut bin, one flat washer from the washer bin, and one spring from the spring bin. "
            "Place each component into the kit tray in that exact order. The components are small "
            "and fragile — use gentle grip force. Return to home when the kit is complete."
        ),
        "objects": [
            {
                "id": "m4_bolt",
                "name": "M4 Bolt",
                "type": "fastener",
                "color": "silver",
                "location": {"x": 0.30, "y": 0.70, "z": 0.03},
                "properties": {
                    "weight_kg": 0.005,
                    "fragility": "high",
                    "size": {"width": 0.007, "height": 0.020, "depth": 0.007}
                }
            },
            {
                "id": "m4_nut",
                "name": "M4 Nut",
                "type": "fastener",
                "color": "silver",
                "location": {"x": 0.10, "y": 0.70, "z": 0.03},
                "properties": {
                    "weight_kg": 0.002,
                    "fragility": "high",
                    "size": {"width": 0.007, "height": 0.004, "depth": 0.007}
                }
            },
            {
                "id": "flat_washer",
                "name": "Flat Washer",
                "type": "fastener",
                "color": "silver",
                "location": {"x": -0.10, "y": 0.70, "z": 0.03},
                "properties": {
                    "weight_kg": 0.001,
                    "fragility": "high",
                    "size": {"width": 0.010, "height": 0.002, "depth": 0.010}
                }
            },
            {
                "id": "spring",
                "name": "Spring",
                "type": "component",
                "color": "silver",
                "location": {"x": -0.30, "y": 0.70, "z": 0.03},
                "properties": {
                    "weight_kg": 0.003,
                    "fragility": "high",
                    "size": {"width": 0.006, "height": 0.015, "depth": 0.006}
                }
            }
        ],
        "locations": [
            {
                "id": "bolt_bin",
                "name": "Bolt Bin",
                "position": {"x": 0.30, "y": 0.70, "z": 0.0},
                "type": "bin"
            },
            {
                "id": "nut_bin",
                "name": "Nut Bin",
                "position": {"x": 0.10, "y": 0.70, "z": 0.0},
                "type": "bin"
            },
            {
                "id": "washer_bin",
                "name": "Washer Bin",
                "position": {"x": -0.10, "y": 0.70, "z": 0.0},
                "type": "bin"
            },
            {
                "id": "spring_bin",
                "name": "Spring Bin",
                "position": {"x": -0.30, "y": 0.70, "z": 0.0},
                "type": "bin"
            },
            {
                "id": "kit_tray",
                "name": "Kit Tray",
                "position": {"x": 0.00, "y": 0.30, "z": 0.02},
                "type": "tray"
            }
        ],
        "robot_constraints": {
            "max_payload_kg": 0.50,
            "reach_radius_m": 0.75,
            "max_grip_force_n": 20.0,
            "max_speed_ms": 0.25,
            "workspace_bounds": {
                "x_min": -0.55,
                "x_max": 0.55,
                "y_min": 0.10,
                "y_max": 0.85,
                "z_min": 0.0,
                "z_max": 0.55
            }
        }
    }
}

ALL_SCENARIOS = [SCENARIO_WAREHOUSE_SORT, SCENARIO_QC_GATE, SCENARIO_KITTING]

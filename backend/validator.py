import math
from typing import List, Tuple
from models import TaskStep, SceneInput, ConstraintWarning, ActionType


class ConstraintValidator:
    def __init__(self, scene: SceneInput):
        self.scene = scene
        self.object_map = {obj.id: obj for obj in scene.objects}
        self.location_map = {loc.id: loc for loc in scene.locations}
        self.constraints = scene.robot_constraints

    def _is_in_workspace(self, x: float, y: float, z: float) -> bool:
        b = self.constraints.workspace_bounds
        return (b.x_min <= x <= b.x_max and
                b.y_min <= y <= b.y_max and
                b.z_min <= z <= b.z_max)

    def _distance_from_base(self, x: float, y: float, z: float) -> float:
        return math.sqrt(x**2 + y**2 + z**2)

    def validate_step(self, step: TaskStep) -> List[ConstraintWarning]:
        warnings = []

        # Payload check for grasp steps
        if step.action_type == ActionType.GRASP and step.object_ref:
            obj = self.object_map.get(step.object_ref)
            if obj and obj.properties.weight_kg > self.constraints.max_payload_kg:
                warnings.append(ConstraintWarning(
                    type="payload_exceeded",
                    message=(
                        f"'{obj.name}' ({obj.properties.weight_kg}kg) exceeds max payload "
                        f"({self.constraints.max_payload_kg}kg)"
                    ),
                    severity="error",
                    step_id=step.id
                ))

        # Workspace and reach checks for steps with a target location
        if step.location_ref:
            loc = self.location_map.get(step.location_ref)
            if loc:
                p = loc.position
                if not self._is_in_workspace(p.x, p.y, p.z):
                    warnings.append(ConstraintWarning(
                        type="workspace_violation",
                        message=(
                            f"Location '{loc.name}' ({p.x:.2f}, {p.y:.2f}, {p.z:.2f}) "
                            f"is outside workspace bounds"
                        ),
                        severity="error",
                        step_id=step.id
                    ))

                dist = self._distance_from_base(p.x, p.y, p.z)
                if dist > self.constraints.reach_radius_m:
                    warnings.append(ConstraintWarning(
                        type="reach_exceeded",
                        message=(
                            f"Location '{loc.name}' is {dist:.2f}m from base, "
                            f"exceeds reach radius ({self.constraints.reach_radius_m}m)"
                        ),
                        severity="warning",
                        step_id=step.id
                    ))

        # Object location reachability for grasp steps
        if step.action_type == ActionType.GRASP and step.object_ref:
            obj = self.object_map.get(step.object_ref)
            if obj:
                p = obj.location
                if not self._is_in_workspace(p.x, p.y, p.z):
                    warnings.append(ConstraintWarning(
                        type="object_out_of_workspace",
                        message=(
                            f"Object '{obj.name}' is at ({p.x:.2f}, {p.y:.2f}, {p.z:.2f}), "
                            f"outside workspace bounds"
                        ),
                        severity="error",
                        step_id=step.id
                    ))

        # Grip force checks
        if step.parameters and step.parameters.grip_force_n is not None:
            force = step.parameters.grip_force_n
            if force > self.constraints.max_grip_force_n:
                warnings.append(ConstraintWarning(
                    type="grip_force_exceeded",
                    message=(
                        f"Grip force {force}N exceeds robot maximum "
                        f"({self.constraints.max_grip_force_n}N)"
                    ),
                    severity="error",
                    step_id=step.id
                ))

            if step.object_ref:
                obj = self.object_map.get(step.object_ref)
                if obj and obj.properties.fragility == "high" and force > 10.0:
                    warnings.append(ConstraintWarning(
                        type="fragility_risk",
                        message=(
                            f"Grip force {force}N risks damaging fragile object '{obj.name}' "
                            f"(fragility: high, recommended max: 10N)"
                        ),
                        severity="warning",
                        step_id=step.id
                    ))
                elif obj and obj.properties.fragility == "medium" and force > 25.0:
                    warnings.append(ConstraintWarning(
                        type="fragility_risk",
                        message=(
                            f"Grip force {force}N may damage medium-fragility object '{obj.name}' "
                            f"(recommended max: 25N)"
                        ),
                        severity="warning",
                        step_id=step.id
                    ))

        # Approach speed check
        if step.parameters and step.parameters.approach_speed_ms is not None:
            speed = step.parameters.approach_speed_ms
            if speed > self.constraints.max_speed_ms:
                warnings.append(ConstraintWarning(
                    type="speed_exceeded",
                    message=(
                        f"Approach speed {speed}m/s exceeds robot maximum "
                        f"({self.constraints.max_speed_ms}m/s)"
                    ),
                    severity="warning",
                    step_id=step.id
                ))

        return warnings

    def validate_plan(
        self, steps: List[TaskStep]
    ) -> Tuple[List[TaskStep], List[ConstraintWarning]]:
        all_warnings: List[ConstraintWarning] = []
        for step in steps:
            step_warnings = self.validate_step(step)
            step.constraint_warnings = step_warnings
            all_warnings.extend(step_warnings)
        return steps, all_warnings

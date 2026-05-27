import anthropic
import json
import os
from typing import Any

from models import (
    SceneInput, TaskPlanResponse, TaskStep, ActionType,
    StepParameters, Vector3, FailureMode, Branch, ConstraintWarning
)
from validator import ConstraintValidator

CREATE_TASK_PLAN_TOOL: dict[str, Any] = {
    "name": "create_task_plan",
    "description": (
        "Create a complete, structured robot task plan that decomposes a natural language "
        "task into ordered, physically-grounded steps with preconditions, effects, and "
        "physical execution parameters."
    ),
    "input_schema": {
        "type": "object",
        "required": ["title", "reasoning", "steps"],
        "properties": {
            "title": {
                "type": "string",
                "description": "Short, descriptive title for this task plan"
            },
            "reasoning": {
                "type": "string",
                "description": (
                    "Brief explanation (2-4 sentences max) of how the task was decomposed "
                    "and any key physical assumptions. Be concise — the steps speak for themselves."
                )
            },
            "steps": {
                "type": "array",
                "description": (
                    "Ordered list of task steps. Main path follows next_step_id. "
                    "Branches diverge from decision points via the branches array."
                ),
                "items": {
                    "type": "object",
                    "required": [
                        "id", "name", "description", "action_type",
                        "preconditions", "effects", "failure_modes", "is_decision_point"
                    ],
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Unique snake_case ID (e.g. 'move_to_bin_a', 'grasp_cylinder')"
                        },
                        "name": {
                            "type": "string",
                            "description": "Human-readable step name, 3-6 words"
                        },
                        "description": {
                            "type": "string",
                            "description": "One-sentence description of what this step does"
                        },
                        "action_type": {
                            "type": "string",
                            "enum": ["move", "grasp", "release", "inspect", "decision", "wait", "home"],
                            "description": "Atomic robot action type"
                        },
                        "object_ref": {
                            "type": "string",
                            "description": "ID of the scene object being acted on. Must match an object.id. Omit if not applicable."
                        },
                        "location_ref": {
                            "type": "string",
                            "description": "ID of the target location. Must match a location.id. Omit if not applicable."
                        },
                        "preconditions": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "STRIPS-style state facts that MUST be true before this step executes. "
                                "Use consistent state variable names across steps "
                                "(e.g. 'gripper_empty', 'robot_at_bin_a', 'part_grasped')."
                            )
                        },
                        "effects": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "State facts that BECOME true after this step completes."
                        },
                        "parameters": {
                            "type": "object",
                            "description": "Physical execution parameters. Include for move/grasp/release steps.",
                            "properties": {
                                "approach_speed_ms": {
                                    "type": "number",
                                    "description": "End-effector speed in m/s (0.05-0.5 typical range)"
                                },
                                "grip_force_n": {
                                    "type": "number",
                                    "description": "Gripper closing force in Newtons. Required for grasp steps."
                                },
                                "clearance_height_m": {
                                    "type": "number",
                                    "description": "Height above target to approach from before descending (0.05-0.20m)"
                                },
                                "approach_vector": {
                                    "type": "object",
                                    "description": "Unit vector for end-effector approach direction",
                                    "properties": {
                                        "x": {"type": "number"},
                                        "y": {"type": "number"},
                                        "z": {"type": "number"}
                                    },
                                    "required": ["x", "y", "z"]
                                }
                            }
                        },
                        "failure_modes": {
                            "type": "array",
                            "description": "1-3 realistic failure conditions and their recovery strategies",
                            "items": {
                                "type": "object",
                                "required": ["condition", "recovery"],
                                "properties": {
                                    "condition": {
                                        "type": "string",
                                        "description": "What can go wrong (e.g. 'grasp_slip', 'object_not_found')"
                                    },
                                    "recovery": {
                                        "type": "string",
                                        "description": "Recovery action (e.g. 'retry_grasp_with_reposition', 'halt_and_alert_operator')"
                                    }
                                }
                            }
                        },
                        "is_decision_point": {
                            "type": "boolean",
                            "description": "True if this step conditionally routes to different next steps"
                        },
                        "branches": {
                            "type": "array",
                            "description": "Required when is_decision_point is true.",
                            "items": {
                                "type": "object",
                                "required": ["condition", "next_step_id"],
                                "properties": {
                                    "condition": {
                                        "type": "string",
                                        "description": "Condition string (e.g. 'weight_under_500g', 'inspection_passed')"
                                    },
                                    "next_step_id": {
                                        "type": "string",
                                        "description": "ID of the step to execute if this condition is true"
                                    }
                                }
                            }
                        },
                        "next_step_id": {
                            "type": "string",
                            "description": (
                                "ID of the next sequential step. Omit for the final step or for "
                                "decision points (which use branches instead)."
                            )
                        }
                    }
                }
            }
        }
    }
}

SYSTEM_PROMPT = """You are an expert robot task planning AI with deep knowledge of industrial \
robotics, behavior trees, and STRIPS-style task planning. You decompose natural language task \
descriptions into precise, machine-executable task plans.

Given a task description and scene context, produce a complete task plan using the \
create_task_plan tool. Follow these rules strictly:

ACTION TYPES:
- move: Navigate end-effector to a position or approach a location
- grasp: Close gripper on an object (always include grip_force_n in parameters)
- release: Open gripper to place an object
- inspect: Apply sensor/vision to evaluate an object
- decision: Conditional branch point — requires branches array with conditions and next_step_ids
- wait: Hold current position
- home: Return end-effector to rest/home position

STEP DECOMPOSITION:
- Break each physical operation into atomic steps: approach → grasp → lift → move → lower → release
- For pick-and-place: always include clearance_height_m to lift above obstacles before transiting
- For inspection tasks: create a separate inspect step followed by a decision step

PRECONDITIONS AND EFFECTS (STRIPS style):
- Use consistent state variable names across the entire plan
- Common preconditions: "gripper_empty", "robot_at_home", "robot_above_[location]", "[object]_grasped"
- Common effects: "gripper_holding_[object]", "robot_at_[location]", "[object]_placed_at_[location]"
- Effects of each step should satisfy preconditions of the next step

PHYSICAL PARAMETERS (choose values appropriate for the object's weight and fragility):
- grip_force_n: 3-10N for fragile/tiny objects, 15-25N for medium, 30-50N for robust/heavy
- approach_speed_ms: 0.05-0.15 m/s for precision/fragile, 0.2-0.4 m/s for standard, 0.4-0.8 for transit
- clearance_height_m: 0.05-0.10m for tight spaces, 0.15-0.20m for standard

DECISION POINTS:
- A decision step itself performs no physical action — it evaluates state and routes
- Each branch.next_step_id must exactly match the id of a step in the plan
- The converging step (where branches rejoin) should be included with a suitable precondition
- Branch condition text MUST be plain English readable by humans, NOT variable names.
  Good: "Under 0.5 kg", "Passes inspection", "Weight 0.5–2 kg", "Over 2 kg", "Object detected"
  Bad: "weight_under_500g", "inspection_passed", "weight_0.5_to_2kg", "object_found"
  Keep conditions short (2–5 words). The step IDs can use snake_case; the condition text must not.

OBJECT AND LOCATION REFERENCES:
- object_ref and location_ref MUST exactly match IDs from the scene context
- Do not invent objects or locations not present in the scene

FAILURE MODES (1-3 per step):
- move: path_blocked → replan_around_obstacle; joint_limit_reached → use_alternative_approach
- grasp: grasp_slip → retry_with_adjusted_position; object_not_found → halt_and_alert_operator
- inspect: sensor_occlusion → reposition_and_retry; ambiguous_result → request_human_verification
- release: object_stuck_to_gripper → apply_release_force; placement_misaligned → adjust_and_retry"""


def plan_task(scene: SceneInput, api_key: str | None = None) -> TaskPlanResponse:
    client = anthropic.Anthropic(api_key=api_key or None)
    scene_dict = {
        "objects": [
            {
                "id": obj.id,
                "name": obj.name,
                "type": obj.type,
                "color": obj.color,
                "location": {"x": obj.location.x, "y": obj.location.y, "z": obj.location.z},
                "properties": {
                    "weight_kg": obj.properties.weight_kg,
                    "fragility": obj.properties.fragility,
                    "size": obj.properties.size
                }
            }
            for obj in scene.objects
        ],
        "locations": [
            {
                "id": loc.id,
                "name": loc.name,
                "type": loc.type,
                "position": {"x": loc.position.x, "y": loc.position.y, "z": loc.position.z}
            }
            for loc in scene.locations
        ],
        "robot_constraints": {
            "max_payload_kg": scene.robot_constraints.max_payload_kg,
            "reach_radius_m": scene.robot_constraints.reach_radius_m,
            "max_grip_force_n": scene.robot_constraints.max_grip_force_n,
            "max_speed_ms": scene.robot_constraints.max_speed_ms,
            "workspace_bounds": {
                "x": f"{scene.robot_constraints.workspace_bounds.x_min} to {scene.robot_constraints.workspace_bounds.x_max}",
                "y": f"{scene.robot_constraints.workspace_bounds.y_min} to {scene.robot_constraints.workspace_bounds.y_max}",
                "z": f"{scene.robot_constraints.workspace_bounds.z_min} to {scene.robot_constraints.workspace_bounds.z_max}"
            }
        }
    }

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        tools=[CREATE_TASK_PLAN_TOOL],
        tool_choice={"type": "tool", "name": "create_task_plan"},
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Plan this task:\n\n{scene.task_description}\n\n"
                    f"Scene context:\n{json.dumps(scene_dict, indent=2)}"
                )
            }
        ]
    )

    raw: dict[str, Any] | None = None
    for block in response.content:
        if block.type == "tool_use" and block.name == "create_task_plan":
            raw = block.input
            break

    if raw is None:
        raise ValueError("Claude did not produce a task plan")

    return _build_response(raw, scene)


def _build_response(raw: dict[str, Any], scene: SceneInput) -> TaskPlanResponse:
    steps: list[TaskStep] = []

    for i, s in enumerate(raw.get("steps", [])):
        try:
            params_raw = s.get("parameters") or {}
            av = params_raw.get("approach_vector")
            params_obj = StepParameters(
                approach_speed_ms=params_raw.get("approach_speed_ms"),
                grip_force_n=params_raw.get("grip_force_n"),
                clearance_height_m=params_raw.get("clearance_height_m"),
                approach_vector=Vector3(x=av["x"], y=av["y"], z=av["z"]) if av else None
            ) if params_raw else None

            branches = [Branch(**b) for b in (s.get("branches") or [])]
            failure_modes = [FailureMode(**f) for f in (s.get("failure_modes") or [])]

            step = TaskStep(
                id=s["id"],
                name=s["name"],
                description=s["description"],
                action_type=ActionType(s["action_type"]),
                object_ref=s.get("object_ref"),
                location_ref=s.get("location_ref"),
                preconditions=s.get("preconditions") or [],
                effects=s.get("effects") or [],
                parameters=params_obj,
                failure_modes=failure_modes,
                is_decision_point=s.get("is_decision_point", False),
                branches=branches if branches else None,
                next_step_id=s.get("next_step_id")
            )
            steps.append(step)
        except Exception as exc:
            print(f"[WARN] Skipped step {i} ({s.get('id', '?')}): {exc}")

    validator = ConstraintValidator(scene)
    steps, plan_warnings = validator.validate_plan(steps)

    return TaskPlanResponse(
        title=raw.get("title", "Task Plan"),
        task_description=scene.task_description,
        steps=steps,
        reasoning=raw.get("reasoning", ""),
        constraint_warnings=plan_warnings,
        total_steps=len(steps),
        decision_points=sum(1 for step in steps if step.is_decision_point)
    )

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class ActionType(str, Enum):
    MOVE = "move"
    GRASP = "grasp"
    RELEASE = "release"
    INSPECT = "inspect"
    DECISION = "decision"
    WAIT = "wait"
    HOME = "home"


class Vector3(BaseModel):
    x: float
    y: float
    z: float


class StepParameters(BaseModel):
    approach_speed_ms: Optional[float] = None
    grip_force_n: Optional[float] = None
    clearance_height_m: Optional[float] = None
    approach_vector: Optional[Vector3] = None


class FailureMode(BaseModel):
    condition: str
    recovery: str


class Branch(BaseModel):
    condition: str
    next_step_id: str


class ConstraintWarning(BaseModel):
    type: str
    message: str
    severity: str  # "warning" | "error"
    step_id: Optional[str] = None


class TaskStep(BaseModel):
    id: str
    name: str
    description: str
    action_type: ActionType
    object_ref: Optional[str] = None
    location_ref: Optional[str] = None
    preconditions: List[str]
    effects: List[str]
    parameters: Optional[StepParameters] = None
    failure_modes: List[FailureMode]
    is_decision_point: bool = False
    branches: Optional[List[Branch]] = None
    next_step_id: Optional[str] = None
    constraint_warnings: List[ConstraintWarning] = Field(default_factory=list)


class ObjectProperties(BaseModel):
    weight_kg: float
    fragility: str  # "low", "medium", "high"
    size: Dict[str, float]


class SceneObject(BaseModel):
    id: str
    name: str
    type: str
    color: Optional[str] = None
    location: Vector3
    properties: ObjectProperties


class SceneLocation(BaseModel):
    id: str
    name: str
    position: Vector3
    type: str  # "bin", "shelf", "conveyor", "tray", "station"


class WorkspaceBounds(BaseModel):
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    z_min: float
    z_max: float


class RobotConstraints(BaseModel):
    max_payload_kg: float
    reach_radius_m: float
    max_grip_force_n: float
    max_speed_ms: float
    workspace_bounds: WorkspaceBounds


class SceneInput(BaseModel):
    task_description: str
    objects: List[SceneObject]
    locations: List[SceneLocation]
    robot_constraints: RobotConstraints


class TaskPlanResponse(BaseModel):
    title: str
    task_description: str
    steps: List[TaskStep]
    reasoning: str
    constraint_warnings: List[ConstraintWarning]
    total_steps: int
    decision_points: int

# Robot Task Planner

Natural language → constraint-validated robot task graphs, powered by Claude.

Type a task like _"Pick up the engine component, inspect it, route to pass or reject bin"_ and get back a structured task graph with ordered steps, preconditions/effects, physical parameters, decision branches, and constraint warnings — all visualized as an interactive D3 graph.

---

## Architecture

```
User Input (text + scene JSON)
        │
        ▼
FastAPI /plan endpoint
        │
        ▼
Scene Parser (Pydantic validation)
        │
        ▼
Claude (tool use → structured task plan)
        │
        ▼
Constraint Validator (payload, workspace, grip force, speed)
        │
        ▼
Task Plan JSON  ──►  D3.js graph (nodes = steps, edges = flow/branches)
```

Claude uses **structured tool use** (not free-text parsing) to emit a typed task plan schema — more reliable than prompting for JSON.

---

## Setup

**1. Clone and install dependencies**

```bash
cd robot-task-planner
pip install -r requirements.txt
```

**2. Set your API key**

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

**3. Run the backend**

```bash
cd backend
uvicorn main:app --reload
```

The server starts at `http://localhost:8000`. It also serves the frontend at `/`.

**4. Open the app**

Visit `http://localhost:8000` in your browser, or open `frontend/index.html` directly.

---

## Demo scenarios

Three pre-built scenarios load from the **Demo scenarios** nav bar:

| Scenario | What it demonstrates |
|---|---|
| **Warehouse Weight Sort** | Multi-branch decision based on measured weight |
| **Assembly Line QC Gate** | Inspect → pass/reject routing |
| **Sensor Kit Assembly** | Sequential kitting with fragility-aware grip parameters |

---

## API

### `POST /plan`

Accepts a scene JSON and returns a structured task plan.

**Request body** (`SceneInput`):

```json
{
  "task_description": "Pick up the red box and sort by weight",
  "objects": [
    {
      "id": "red_box",
      "name": "Red Box",
      "type": "box",
      "location": {"x": 0.25, "y": 0.65, "z": 0.05},
      "properties": {"weight_kg": 0.35, "fragility": "low", "size": {"width": 0.15, "height": 0.12, "depth": 0.10}}
    }
  ],
  "locations": [
    {"id": "intake_conveyor", "name": "Intake Conveyor", "position": {"x": 0.25, "y": 0.65, "z": 0.0}, "type": "conveyor"},
    {"id": "shelf_a", "name": "Shelf A", "position": {"x": -0.40, "y": 0.50, "z": 0.35}, "type": "shelf"}
  ],
  "robot_constraints": {
    "max_payload_kg": 3.0,
    "reach_radius_m": 0.9,
    "max_grip_force_n": 60.0,
    "max_speed_ms": 0.8,
    "workspace_bounds": {"x_min": -0.65, "x_max": 0.65, "y_min": 0.1, "y_max": 0.9, "z_min": 0.0, "z_max": 0.7}
  }
}
```

**Response** (`TaskPlanResponse`): ordered steps with preconditions, effects, physical parameters, failure modes, decision branches, and constraint warnings.

### `GET /scenarios`

Returns the three pre-built demo scenarios (no API key required).

---

## Key concepts

- **Preconditions / effects** (STRIPS-style): each step declares what must be true before it runs and what becomes true after. This is what separates a real task plan from a naive instruction list.
- **Decision branches**: conditional routing (pass/fail inspection, weight threshold) generates a branching graph, not just a linear sequence.
- **Constraint validator**: flags steps where object weight exceeds payload, locations fall outside the workspace envelope, or grip force risks damaging fragile parts.
- **Behavior tree vocabulary**: action types map to BT primitives — `move`, `grasp`, `release`, `inspect`, `decision`, `wait`, `home`.

---

## Deployment

- **Frontend**: deploy `frontend/` to Vercel. Set `API_URL` in `app.js` to your backend URL.
- **Backend**: deploy `backend/` to Railway or Render. Set `ANTHROPIC_API_KEY` as an environment variable.

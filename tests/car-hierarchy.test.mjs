import assert from "node:assert/strict";
import test from "node:test";
import { createCar } from "../src/car.js";

test("car keeps the reusable hierarchy and Quest-scale geometry budget", () => {
  const car = createCar();
  const names = new Set();
  let drawCalls = 0;
  let triangles = 0;
  car.root.traverse((object) => {
    names.add(object.name);
    if (!object.isMesh) return;
    drawCalls += 1;
    const baseTriangles = object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.attributes.position.count / 3;
    triangles += baseTriangles * (object.isInstancedMesh ? object.count : 1);
  });

  for (const requiredName of [
    "Wheel_FL_SteeringPivot",
    "Wheel_FR_SteeringPivot",
    "Wheel_RL_AxlePivot",
    "Wheel_RR_AxlePivot",
    "Steering_Wheel_Pivot",
    "Door_Left_HingePivot",
    "Door_Right_HingePivot",
    "Hood_Hinge_Pivot",
    "Trunk_Hinge_Pivot",
    "Complete_Cockpit",
    "Driver_Seat",
    "Instrument_Cluster_Display",
  ]) {
    assert.ok(names.has(requiredName), `missing ${requiredName}`);
  }

  assert.deepEqual(car.root.userData.driverEye, [-0.38, 1.19, 0.26]);
  assert.ok(triangles < 75_000, `triangle count ${triangles} exceeds target`);
  assert.ok(drawCalls < 140, `draw-call count ${drawCalls} exceeds target`);
});


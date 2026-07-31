import assert from "node:assert/strict";
import test from "node:test";
import { VehicleSimulation } from "../src/vehicle.js";

test("launch gate holds the car while allowing the engine to build revs", () => {
  const vehicle = new VehicleSimulation();
  for (let index = 0; index < 240; index += 1) {
    vehicle.step(1 / 120, { throttle: 1, brake: 0, steer: 0 }, false);
  }
  assert.equal(vehicle.distance, 0);
  assert.ok(vehicle.rpm > 3500);
});

test("fixed-step quarter-mile simulation remains finite and drivable", () => {
  const vehicle = new VehicleSimulation();
  for (let index = 0; index < 2400; index += 1) {
    if (vehicle.rpm > 7350) vehicle.shiftUp();
    vehicle.step(1 / 120, { throttle: 1, brake: 0, steer: 0.03 }, true);
  }
  assert.ok(Number.isFinite(vehicle.position.x));
  assert.ok(Number.isFinite(vehicle.position.z));
  assert.ok(Number.isFinite(vehicle.speed));
  assert.ok(vehicle.distance > 300);
  assert.ok(vehicle.gear >= 4);
  assert.ok(Math.abs(vehicle.yaw) <= 0.19);
});


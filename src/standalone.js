import "./game.css";
import { mountDragRace } from "./game.js";

const app = document.querySelector("#app");
mountDragRace(app).catch((error) => {
  console.error(error);
  app.innerHTML = `<div style="padding:2rem;color:white;font:16px monospace">Unable to start the WebGL experience.</div>`;
});


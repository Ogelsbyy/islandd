import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { inTauri } from "./lib/tauri";

if (inTauri) document.body.classList.add("tauri");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

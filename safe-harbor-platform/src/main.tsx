import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { configureApiFetch } from "./lib/api";

configureApiFetch();

createRoot(document.getElementById("root")!).render(<App />);

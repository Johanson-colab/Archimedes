import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { UISettingsProvider } from "./i18n";
import "./tokens.css";
import "./styles.css";
import "./typography.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UISettingsProvider>
      <App />
    </UISettingsProvider>
  </StrictMode>,
);

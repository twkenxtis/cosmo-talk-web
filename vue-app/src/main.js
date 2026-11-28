import { createApp } from "vue";
import "./styles/style.css";
import App from "./App.vue";

const savedTheme = localStorage.getItem("cosmo_ui_theme_mode") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);

createApp(App).mount("#app");

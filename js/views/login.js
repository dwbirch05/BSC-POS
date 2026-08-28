import { store } from "../store.js";
import { APP_MODE, APP_NAME } from "../config.js";
import { qs, toast } from "../ui.js";

export function renderLogin(container, onLoggedIn) {
  container.innerHTML = `
    <div class="login-wrap">
      <div class="card">
        <h2>${APP_NAME}</h2>
        <p class="text-dim">
          ${APP_MODE === "demo"
            ? `Demo mode &mdash; data is stored only in this browser. <span class="badge-mode demo">DEMO</span>`
            : `<span class="badge-mode firebase">LIVE</span> Sign in with your staff account.`}
        </p>
        <form id="login-form">
          <div class="field">
            <label>Email</label>
            <input type="email" name="email" required autofocus value="${APP_MODE === "demo" ? "demo@bigscreencollectables.local" : ""}" />
          </div>
          ${APP_MODE === "firebase" ? `
          <div class="field">
            <label>Password</label>
            <input type="password" name="password" required />
          </div>` : ""}
          <button class="primary" type="submit" style="width:100%">Sign in</button>
        </form>
      </div>
    </div>
  `;

  qs("#login-form", container).addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const email = form.get("email");
    const password = form.get("password");
    try {
      const user = APP_MODE === "demo"
        ? await store.auth.login(email)
        : await store.auth.login(email, password);
      onLoggedIn(user);
    } catch (err) {
      toast(err.message || "Sign in failed", "error");
    }
  });
}

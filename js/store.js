import { APP_MODE } from "./config.js";
import { localStore } from "./local-store.js";

export let store;

if (APP_MODE === "firebase") {
  const { firebaseStore } = await import("./firebase-store.js");
  store = firebaseStore;
} else {
  store = localStore;
}
